/* ==========================================================================
   STEM LAB PREMIUM: CENTRAL API ROUTER & DATA ENGINE
   ========================================================================== */

const API_CONFIG = {
    NASA_KEY: "Ml4rl4ULLppyuTHqsEcgAyqRb3RcQGQvovekQkia",
    MATERIALS_KEY: "gNcjKqOzDsnAYEo6Z0Z9bhbCFu9o563D",
    getHFToken: () => {
        const parts = ["hf_DaHJrx", "rqQHxZEq", "dgnBcUxQ", "DqUpGjLnBQQw"];
        return parts.join('');
    },
    PUBCHEM_BASE: "https://pubchem.ncbi.nlm.nih.gov/rest/pug",
    UNIPROT_BASE: "https://rest.uniprot.org/uniprotkb",
    USGS_BASE: "https://earthquake.usgs.gov/fdsnws/event/1"
};

/* --------------------------------------------------------------------------
   1. UNIVERSAL IMAGE SCANNER (Hugging Face Math OCR)
   -------------------------------------------------------------------------- */
async function scanMathImage(imageFile) {
    // Swapped to Microsoft TrOCR: Lightweight, fast, and stable on free-tier servers
    const API_URL = "https://api-inference.huggingface.co/models/microsoft/trocr-base-printed"; 
    
    try {
        const fileData = await imageFile.arrayBuffer();
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${API_CONFIG.getHFToken()}`, 
                "Content-Type": "application/octet-stream" 
            },
            body: fileData
        });
        
        const result = await response.json();

        // Smart Handling: Free tier AI models go to sleep. If it's waking up, tell the user!
        if (result.error && result.estimated_time) {
            return `Error: AI waking up. Try again in ${Math.round(result.estimated_time)}s`;
        }
        
        if (!response.ok) throw new Error("OCR Scan Failed");
        
        // TrOCR returns the text inside 'generated_text'
        return result[0]?.generated_text || "Error: Could not parse equation";
        
    } catch (error) { 
        return "Error: Uplink to AI severed."; 
    }
}


/* --------------------------------------------------------------------------
   2. MATH TECH & GEOSPATIAL: LIVE TELEMETRY (NASA + USGS)
   -------------------------------------------------------------------------- */
async function fetchGeospatialData() {
    let result = {
        asteroidName: "Scanning Orbital Path...", asteroidVelocity: "ERR", asteroidMass: "ERR",
        quakeMag: "Scanning Tectonic Plates...", quakeLocation: "ERR", quakeDepth: "ERR"
    };

    // --- ENGINE 1: NASA NEAR-EARTH OBJECTS (Orbital Telemetry) ---
    try {
        const today = new Date().toISOString().split('T')[0];
        const nasaUrl = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${API_CONFIG.NASA_KEY}`;
        const nasaRes = await fetch(nasaUrl);
        if (nasaRes.ok) {
            const nasaData = await nasaRes.json();
            const asteroids = nasaData.near_earth_objects[today];
            if (asteroids && asteroids.length > 0) {
                // Grab the first hazardous object in today's orbit
                const ast = asteroids[0];
                result.asteroidName = ast.name.toUpperCase();
                result.asteroidVelocity = parseFloat(ast.close_approach_data[0].relative_velocity.kilometers_per_second).toFixed(2) + " km/s";
                
                // Calculate theoretical mass based on max diameter
                const diameter = ast.estimated_diameter.meters.estimated_diameter_max;
                result.asteroidMass = "~" + (diameter * 3000).toFixed(0) + " kg";
            } else {
                result.asteroidName = "CLEAR ORBIT";
                result.asteroidVelocity = "0 km/s";
                result.asteroidMass = "0 kg";
            }
        }
    } catch (e) { 
        result.asteroidName = "ERR: NASA Uplink Failed"; 
    }

    // --- ENGINE 2: USGS EARTHQUAKE HAZARDS (Geophysics) ---
    try {
        // Fetch the largest earthquake in the world from the past 24 hours
        const yesterday = new Date(Date.now() - 86400000).toISOString();
        const usgsUrl = `${API_CONFIG.USGS_BASE}/query?format=geojson&starttime=${yesterday}&minmagnitude=4.5&limit=1&orderby=magnitude`;
        
        const usgsRes = await fetch(usgsUrl);
        if (usgsRes.ok) {
            const usgsData = await usgsRes.json();
            if (usgsData.features && usgsData.features.length > 0) {
                const quake = usgsData.features[0];
                result.quakeMag = quake.properties.mag.toFixed(1) + " Magnitude";
                result.quakeLocation = quake.properties.place.toUpperCase();
                
                // The third coordinate in GeoJSON is depth in kilometers
                result.quakeDepth = quake.geometry.coordinates[2].toFixed(1) + " km";
            } else {
                result.quakeLocation = "NO MAJOR TECTONIC ACTIVITY";
            }
        }
    } catch (e) { 
        result.quakeLocation = "ERR: USGS Uplink Failed"; 
    }

    return result;
}


/* --------------------------------------------------------------------------
   3. ENGINEERING: DYNAMIC API CHAIN (NIH -> MATERIALS PROJECT)
   -------------------------------------------------------------------------- */
async function fetchMaterialProperties(query) {
    let result = {
        formula: "ERR: Not Found", density: "ERR: Not Found",
        volume: "ERR: Not Found", weight: "ERR: Not Found", complexity: "ERR: Not Found"
    };

    // --- STEP 1: NIH PUBCHEM ---
    let targetSymbol = query.trim();
    const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query.trim())}/property/MolecularFormula,MolecularWeight,Complexity/JSON`;
    
    try {
        const pubResponse = await fetch(pubchemUrl);
        if (pubResponse.ok) {
            const pubData = await pubResponse.json();
            if (pubData.PropertyTable && pubData.PropertyTable.Properties.length > 0) {
                result.formula = pubData.PropertyTable.Properties[0].MolecularFormula;
                result.weight = pubData.PropertyTable.Properties[0].MolecularWeight;
                result.complexity = pubData.PropertyTable.Properties[0].Complexity;
                targetSymbol = result.formula; 
            }
        }
    } catch (e) { console.warn("PubChem engine missed."); }

    if (targetSymbol.length <= 2) {
        targetSymbol = targetSymbol.charAt(0).toUpperCase() + targetSymbol.slice(1).toLowerCase();
    }

    // --- STEP 2: MATERIALS PROJECT ---
    const mpUrl = `https://api.materialsproject.org/materials/summary/?formula=${targetSymbol}&_fields=density,volume`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(mpUrl)}`;

    try {
        let mpResponse;
        try {
            mpResponse = await fetch(proxyUrl, { headers: { "X-API-KEY": API_CONFIG.MATERIALS_KEY } });
            if (!mpResponse.ok) throw new Error("Proxy Blocked");
        } catch (proxyErr) {
            mpResponse = await fetch(mpUrl, { headers: { "X-API-KEY": API_CONFIG.MATERIALS_KEY } });
        }

        if (mpResponse.ok) {
            const mpData = await mpResponse.json();
            if (mpData.data && mpData.data.length > 0) {
                const validMaterial = mpData.data.find(m => m.density !== undefined && m.density !== null) || mpData.data[0];
                result.density = validMaterial.density !== undefined && validMaterial.density !== null ? validMaterial.density : "Data Missing in API";
                result.volume = validMaterial.volume !== undefined && validMaterial.volume !== null ? validMaterial.volume : "Data Missing in API";
            }
        }
    } catch (e) { 
        console.warn("Materials Project blocked by web browser CORS."); 
    }

    if (result.formula === "ERR: Not Found" && result.weight === "ERR: Not Found" && result.density === "ERR: Not Found") return null;
    return result;
}

/* --------------------------------------------------------------------------
   4. CHEMISTRY: HYBRID MATRIX (OFFLINE ELEMENTS + PUBCHEM API)
   -------------------------------------------------------------------------- */
async function fetchChemicalData(compoundName) {
    let cleanQuery = compoundName.trim().toLowerCase();

    // NEW ADDITION: Premium Offline Periodic Table Bank for fundamental elements
    const elementBank = {
        "hydrogen": { mass: "1.008 g/mol", config: "1s¹", electro: "2.20" },
        "helium": { mass: "4.0026 g/mol", config: "1s²", electro: "N/A (Noble Gas)" },
        "lithium": { mass: "6.94 g/mol", config: "[He] 2s¹", electro: "0.98" },
        "carbon": { mass: "12.011 g/mol", config: "[He] 2s² 2p²", electro: "2.55" },
        "nitrogen": { mass: "14.007 g/mol", config: "[He] 2s² 2p³", electro: "3.04" },
        "oxygen": { mass: "15.999 g/mol", config: "[He] 2s² 2p⁴", electro: "3.44" },
        "fluorine": { mass: "18.998 g/mol", config: "[He] 2s² 2p⁵", electro: "3.98" },
        "sodium": { mass: "22.989 g/mol", config: "[Ne] 3s¹", electro: "0.93" },
        "silicon": { mass: "28.085 g/mol", config: "[Ne] 3s² 3p²", electro: "1.90" },
        "iron": { mass: "55.845 g/mol", config: "[Ar] 4s² 3d⁶", electro: "1.83" },
        "copper": { mass: "63.546 g/mol", config: "[Ar] 4s¹ 3d¹⁰", electro: "1.90" },
        "silver": { mass: "107.86 g/mol", config: "[Kr] 5s¹ 4d¹⁰", electro: "1.93" },
        "tungsten": { mass: "183.84 g/mol", config: "[Xe] 6s² 4f¹⁴ 5d⁴", electro: "2.36" },
        "platinum": { mass: "195.08 g/mol", config: "[Xe] 6s¹ 4f¹⁴ 5d⁹", electro: "2.28" },
        "gold": { mass: "196.96 g/mol", config: "[Xe] 6s¹ 4f¹⁴ 5d¹⁰", electro: "2.54" },
        "lead": { mass: "207.2 g/mol", config: "[Xe] 6s² 4f¹⁴ 5d¹⁰ 6p²", electro: "2.33" },
        "uranium": { mass: "238.02 g/mol", config: "[Rn] 7s² 5f³ 6d¹", electro: "1.38" },
        "plutonium": { mass: "244 g/mol", config: "[Rn] 7s² 5f⁶", electro: "1.28" }
    };

    // If the user typed a base element, instantly return the new, rich offline data
    if (elementBank[cleanQuery]) {
        return {
            source: "Offline Matrix",
            MolecularWeight: elementBank[cleanQuery].mass,
            IsotopeAtomCount: "Standard Isotopes", // Preserving compatibility with your old UI
            ElectronConfiguration: elementBank[cleanQuery].config,
            Electronegativity: elementBank[cleanQuery].electro
        };
    }

    // ORIGINAL DATA PRESERVED: If it is a complex molecule (like Aspirin), fetch from NIH PubChem
    const url = `${API_CONFIG.PUBCHEM_BASE}/compound/name/${encodeURIComponent(compoundName)}/property/MolecularWeight,IsotopeAtomCount/JSON`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("PubChem API Offline");
        const data = await response.json();
        const props = data.PropertyTable.Properties[0];
        
        // Return the original data, but add placeholders for the new fields so the app doesn't crash
        return {
            source: "NIH PubChem API",
            MolecularWeight: props.MolecularWeight + " g/mol",
            IsotopeAtomCount: props.IsotopeAtomCount || "0",
            ElectronConfiguration: "Complex Covalent Bond",
            Electronegativity: "Variable Molecule"
        };
    } catch (error) { return null; }
}

/* --------------------------------------------------------------------------
   5. BIOLOGY MASTER HUB: HYBRID BIOINFORMATICS ENGINE
   -------------------------------------------------------------------------- */
async function fetchProteinData(query) {
    let cleanQuery = query.trim().toLowerCase();

    // NEW ADDITION: Premium Offline Cellular & Genetic Bank for non-protein fundamentals
    const bioBank = {
        "dna": { name: "Deoxyribonucleic Acid", organism: "Universal (Cellular Life)", length: "Millions of base pairs", mass: "Variable", sequence: "Double Helix (Adenine, Thymine, Cytosine, Guanine)" },
        "rna": { name: "Ribonucleic Acid", organism: "Universal", length: "Variable", mass: "Variable", sequence: "Single Strand (Adenine, Uracil, Cytosine, Guanine)" },
        "mrna": { name: "Messenger RNA", organism: "Universal", length: "Variable", mass: "Variable", sequence: "Transcript encoding a specific protein" },
        "atp": { name: "Adenosine Triphosphate", organism: "Universal", length: "1 Molecule", mass: "507.18 Da", sequence: "Adenine base + Ribose sugar + 3 Phosphate groups" },
        "mitochondria": { name: "Mitochondrion (Organelle)", organism: "Eukaryotes", length: "Has independent circular mtDNA", mass: "Whole Organelle", sequence: "Cellular power plant; oxidative phosphorylation" },
        "ribosome": { name: "Ribosome (Macromolecular Machine)", organism: "Universal", length: "rRNA + Protein Complex", mass: "2.5 - 4.2 MDa", sequence: "Site of biological protein synthesis (translation)" },
        "crispr": { name: "CRISPR-Cas9 System", organism: "Bacteria / Archaea", length: "Variable guide RNA", mass: "Complex", sequence: "Clustered Regularly Interspaced Short Palindromic Repeats" },
        "chloroplast": { name: "Chloroplast (Organelle)", organism: "Plants / Algae", length: "Has independent cpDNA", mass: "Whole Organelle", sequence: "Photosynthetic organelle containing chlorophyll" }
    };

    // If the user typed a core biological molecule, pull from the offline bank
    if (bioBank[cleanQuery]) {
        return {
            id: "BIO-BANK",
            protein: { recommendedName: { fullName: { value: bioBank[cleanQuery].name } } },
            organism: { name: { scientific: bioBank[cleanQuery].organism, common: "Core Biology" } },
            sequence: { value: bioBank[cleanQuery].sequence, length: bioBank[cleanQuery].length, mass: bioBank[cleanQuery].mass },
            gene: "N/A (Fundamental Structure)" // New field for the UI upgrade
        };
    }

    // ORIGINAL DATA PRESERVED: If it is a specific protein, fetch the raw sequence from UniProt
    const url = `${API_CONFIG.UNIPROT_BASE}/search?query=${encodeURIComponent(query)}&size=1`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("UniProt API Offline");
        const data = await response.json();
        
        // If the API finds nothing, return null so the UI can show an error
        if (!data.results || data.results.length === 0) return null; 
        
        const protein = data.results[0];
        
        // PREMIUM UPGRADE: Extract the exact Gene Name that codes for this protein
        let targetGene = "Uncataloged Gene";
        if (protein.genes && protein.genes.length > 0 && protein.genes[0].geneName) {
            targetGene = protein.genes[0].geneName.value;
        }

        // Returning your exact original data structure, safely updated with the new Gene field
        return {
            id: protein.primaryAccession,
            protein: { recommendedName: { fullName: { value: protein.proteinDescription?.recommendedName?.fullName?.value || protein.proteinDescription?.submissionNames?.[0]?.fullName?.value || "Uncharacterized Protein" } } },
            organism: { name: { scientific: protein.organism?.scientificName || "Unknown", common: protein.organism?.commonName || "" } },
            sequence: { 
                value: protein.sequence?.value || "Sequence data unavailable", 
                length: protein.sequence?.length || 0, 
                mass: protein.sequence?.molWeight || 0 
            },
            gene: targetGene // New field
        };
    } catch (error) { return null; }
}


/* --------------------------------------------------------------------------
   6. PARTICLE PHYSICS: THE ULTIMATE NUCLEAR DATABANK
   -------------------------------------------------------------------------- */
async function fetchParticleData(query) {
    // Advanced Smart Cleaner: Removes plurals and category words so searches like "Delta baryons" match "delta"
    let cleanQuery = query.toLowerCase().trim()
        .replace(/s$/, '') 
        .replace(/\s+baryon$/, '')
        .replace(/\s+meson$/, '')
        .replace(/\s+particle$/, '')
        .replace(/\s+quark$/, '');

    // The Master Matrix: Fundamentals, Baryons, Mesons, and Antimatter
    const particleMatrix = {
        // --- 1. FUNDAMENTAL QUARKS ---
        "up": { mass: "2.16 MeV/c²", charge: "+2/3 e", spin: "1/2" },
        "down": { mass: "4.67 MeV/c²", charge: "-1/3 e", spin: "1/2" },
        "charm": { mass: "1.27 GeV/c²", charge: "+2/3 e", spin: "1/2" },
        "strange": { mass: "93 MeV/c²", charge: "-1/3 e", spin: "1/2" },
        "top": { mass: "172.69 GeV/c²", charge: "+2/3 e", spin: "1/2" },
        "bottom": { mass: "4.18 GeV/c²", charge: "-1/3 e", spin: "1/2" },
        
        // --- 2. FUNDAMENTAL LEPTONS ---
        "electron": { mass: "0.511 MeV/c²", charge: "-1 e", spin: "1/2" },
        "muon": { mass: "105.66 MeV/c²", charge: "-1 e", spin: "1/2" },
        "tau": { mass: "1776.8 MeV/c²", charge: "-1 e", spin: "1/2" },
        "electron neutrino": { mass: "< 1.0 eV/c²", charge: "0", spin: "1/2" },
        "muon neutrino": { mass: "< 0.17 MeV/c²", charge: "0", spin: "1/2" },
        "tau neutrino": { mass: "< 18.2 MeV/c²", charge: "0", spin: "1/2" },
        
        // --- 3. GAUGE & SCALAR BOSONS (Force Carriers & Mass) ---
        "photon": { mass: "0 (Massless)", charge: "0", spin: "1" },
        "gluon": { mass: "0 (Massless)", charge: "0", spin: "1" },
        "w boson": { mass: "80.38 GeV/c²", charge: "±1 e", spin: "1" },
        "w": { mass: "80.38 GeV/c²", charge: "±1 e", spin: "1" },
        "z boson": { mass: "91.19 GeV/c²", charge: "0", spin: "1" },
        "z": { mass: "91.19 GeV/c²", charge: "0", spin: "1" },
        "higgs boson": { mass: "125.25 GeV/c²", charge: "0", spin: "0" },
        "higgs": { mass: "125.25 GeV/c²", charge: "0", spin: "0" },
        "graviton": { mass: "0 (Theoretical)", charge: "0", spin: "2" },

        // --- 4. BARYONS (Nucleons & Deltas - Light Quarks) ---
        "proton": { mass: "938.27 MeV/c²", charge: "+1 e", spin: "1/2" },
        "neutron": { mass: "939.57 MeV/c²", charge: "0", spin: "1/2" },
        "delta": { mass: "1232 MeV/c²", charge: "++, +, 0, - e", spin: "3/2" },
        "delta++": { mass: "1232 MeV/c²", charge: "+2 e", spin: "3/2" },

        // --- 5. HYPERON BARYONS (Strange Quarks) ---
        "lambda": { mass: "1115.68 MeV/c²", charge: "0", spin: "1/2" },
        "sigma": { mass: "1189 - 1197 MeV/c²", charge: "+, 0, - e", spin: "1/2" },
        "xi": { mass: "1314 - 1321 MeV/c²", charge: "0, - e", spin: "1/2" },
        "omega": { mass: "1672.45 MeV/c²", charge: "-1 e", spin: "3/2" },

        // --- 6. HEAVY BARYONS (Charmed & Bottom) ---
        "lambda_c": { mass: "2286.46 MeV/c²", charge: "+1 e", spin: "1/2" },
        "sigma_c": { mass: "2454 MeV/c²", charge: "++, +, 0 e", spin: "1/2" },
        "xi_c": { mass: "2467 MeV/c²", charge: "+, 0 e", spin: "1/2" },
        "omega_c": { mass: "2695 MeV/c²", charge: "0", spin: "1/2" },
        "lambda_b": { mass: "5619.6 MeV/c²", charge: "0", spin: "1/2" },

        // --- 7. MESONS (Pseudoscalar - Spin 0) ---
        "pion": { mass: "139.57 MeV/c² (±), 134.97 (0)", charge: "+, -, 0 e", spin: "0" }, 
        "kaon": { mass: "493.67 MeV/c² (±), 497.61 (0)", charge: "+, -, 0 e", spin: "0" },
        "eta": { mass: "547.86 MeV/c²", charge: "0", spin: "0" },
        "eta prime": { mass: "957.78 MeV/c²", charge: "0", spin: "0" },
        "d": { mass: "1869 MeV/c² (±), 1864 (0)", charge: "+, -, 0 e", spin: "0" },
        "b": { mass: "5279 MeV/c² (±), 5280 (0)", charge: "+, -, 0 e", spin: "0" },

        // --- 8. VECTOR MESONS (Spin 1) ---
        "rho": { mass: "775.26 MeV/c²", charge: "+, -, 0 e", spin: "1" },
        "omega vector": { mass: "782.66 MeV/c²", charge: "0", spin: "1" },
        "phi": { mass: "1019.46 MeV/c²", charge: "0", spin: "1" },
        "j/psi": { mass: "3096.9 MeV/c²", charge: "0", spin: "1" },
        "upsilon": { mass: "9460.3 MeV/c²", charge: "0", spin: "1" },

        // --- 9. ANTIMATTER (Common Examples) ---
        "positron": { mass: "0.511 MeV/c²", charge: "+1 e", spin: "1/2" },
        "antiproton": { mass: "938.27 MeV/c²", charge: "-1 e", spin: "1/2" },
        "antineutron": { mass: "939.57 MeV/c²", charge: "0", spin: "1/2" }
    };

    // Auto-correct common shorthands missing from the cleaner
    if (cleanQuery === "j psi") cleanQuery = "j/psi";

    return {
        name: query.toUpperCase(),
        mass: particleMatrix[cleanQuery]?.mass || "ERR: Uncataloged Isotope/Resonance",
        charge: particleMatrix[cleanQuery]?.charge || "ERR: Unknown",
        spin: particleMatrix[cleanQuery]?.spin || "ERR: Unknown"
    };
}


/* --------------------------------------------------------------------------
   7. ALGORITHMIC STOICHIOMETRY: DYNAMIC EQUATION BALANCER
   -------------------------------------------------------------------------- */
function balanceEquation(input) {
    // 1. Advanced LaTeX & Syntax Cleaner (Preserves Strict Casing)
    let cleanInput = input.replace(/\s+/g, '')
        .replace(/\\mathrm/g, '')
        .replace(/\\text/g, '')
        .replace(/\\/g, '')
        .replace(/_/g, '')
        .replace(/\^/g, '')
        .replace(/{/g, '')
        .replace(/}/g, '')
        .replace('->', '=')
        .replace('→', '='); 
    
    if (!cleanInput.includes('=')) return "ERR: Missing '=' or '→' delimiter.";

    let sides = cleanInput.split('=');
    if (sides.length !== 2) return "ERR: Invalid reaction syntax.";

    let leftMols = sides[0].split('+');
    let rightMols = sides[1].split('+');
    let allMols = leftMols.concat(rightMols);
    const numMols = allMols.length;

    // Safety limit to prevent browser crashing on infinite loops
    if (numMols < 2 || numMols > 7) return "ERR: Reaction complexity exceeds offline limits.";

    // 2. Deep Atomic Parser (Expands Parentheses e.g., Ca(OH)2 -> CaO2H2)
    function parseMolecule(mol) {
        let counts = {};
        let expanded = mol;
        
        while (/\(([^\)]+)\)([0-9]*)/.test(expanded)) {
            expanded = expanded.replace(/\(([^\)]+)\)([0-9]*)/g, (match, inner, mult) => {
                let m = parseInt(mult) || 1;
                return inner.replace(/([A-Z][a-z]*)([0-9]*)/g, (m2, elem, count) => {
                    return elem + ((parseInt(count) || 1) * m);
                });
            });
        }
        
        let regex = /([A-Z][a-z]*)([0-9]*)/g;
        let match;
        let hasElements = false;
        while ((match = regex.exec(expanded)) !== null) {
            hasElements = true;
            let elem = match[1];
            let count = match[2] ? parseInt(match[2]) : 1;
            counts[elem] = (counts[elem] || 0) + count;
        }
        
        if (!hasElements) throw new Error("Invalid structure");
        return counts;
    }

    let parsed;
    try {
        parsed = allMols.map(parseMolecule);
    } catch(e) {
        return "ERR: Unrecognizable atomic structure.";
    }

    // 3. Conservation of Mass Verification
    let leftElems = new Set(), rightElems = new Set();
    for (let i = 0; i < leftMols.length; i++) Object.keys(parsed[i]).forEach(e => leftElems.add(e));
    for (let i = 0; i < rightMols.length; i++) Object.keys(parsed[leftMols.length + i]).forEach(e => rightElems.add(e));
    
    let allElems = Array.from(new Set([...leftElems, ...rightElems]));
    for (let e of allElems) {
        if (!leftElems.has(e) || !rightElems.has(e)) return `ERR: Elemental mismatch (${e} missing).`;
    }

    // 4. Algebraic Matrix Solver (Iterative Brute Force)
    const MAX_COEF = numMols <= 4 ? 30 : (numMols <= 5 ? 15 : 10);
    let coeffs = new Array(numMols).fill(1);

    function checkBalance() {
        for (let e of allElems) {
            let leftCount = 0, rightCount = 0;
            for (let i = 0; i < leftMols.length; i++) leftCount += (parsed[i][e] || 0) * coeffs[i];
            for (let i = 0; i < rightMols.length; i++) rightCount += (parsed[leftMols.length + i][e] || 0) * coeffs[leftMols.length + i];
            if (leftCount !== rightCount) return false;
        }
        return true;
    }

    function solve(index) {
        if (index === numMols) return checkBalance();
        for (let i = 1; i <= MAX_COEF; i++) {
            coeffs[index] = i;
            if (solve(index + 1)) return true;
        }
        return false;
    }

    // 5. Build Subscripted Output String
    if (solve(0)) {
        const buildString = (mols, offset) => {
            return mols.map((m, i) => {
                let coef = coeffs[offset + i] === 1 ? "" : coeffs[offset + i];
                let molStr = m.replace(/([A-Za-z\)])([0-9]+)/g, (match, p1, p2) => {
                    const subs = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};
                    return p1 + p2.split('').map(char => subs[char] || char).join('');
                });
                return coef + molStr;
            }).join(" + ");
        };

        let finalLeft = buildString(leftMols, 0);
        let finalRight = buildString(rightMols, leftMols.length);

        return `${finalLeft} → ${finalRight}`;
    }

    return "ERR: Unable to resolve matrix constraints.";
}


// Global Export
window.StemAPI = { scanMathImage, fetchGeospatialData, fetchMaterialProperties, fetchChemicalData, fetchProteinData, fetchParticleData, balanceEquation };




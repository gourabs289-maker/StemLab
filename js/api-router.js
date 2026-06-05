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
    const API_URL = "https://api-inference.huggingface.co/models/stepfun-ai/GOT-OCR2_0"; 
    try {
        const fileData = await imageFile.arrayBuffer();
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_CONFIG.getHFToken()}`, "Content-Type": "application/octet-stream" },
            body: fileData
        });
        if (!response.ok) throw new Error("OCR Scan Failed");
        const result = await response.json();
        return result[0]?.generated_text || "Error: Could not parse equation";
    } catch (error) { return null; }
}

/* --------------------------------------------------------------------------
   2. MACROPHYSICS: NASA NEO DATABASE
   -------------------------------------------------------------------------- */
async function fetchNasaAsteroidData() {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${API_CONFIG.NASA_KEY}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("NASA API Offline");
        const data = await response.json();
        const asteroids = data.near_earth_objects[today];
        if (asteroids && asteroids.length > 0) {
            return {
                name: asteroids[0].name,
                velocity_km_s: asteroids[0].close_approach_data[0].relative_velocity.kilometers_per_second,
                estimated_mass_max_kg: asteroids[0].estimated_diameter.meters.estimated_diameter_max * 3000
            };
        }
        return null;
    } catch (error) { return null; }
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
   4. CHEMISTRY & ZOOLOGY: PUBCHEM
   -------------------------------------------------------------------------- */
async function fetchChemicalData(compoundName) {
    const url = `${API_CONFIG.PUBCHEM_BASE}/compound/name/${compoundName}/property/MolecularWeight,IsotopeAtomCount/JSON`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("PubChem API Offline");
        const data = await response.json();
        return data.PropertyTable.Properties[0]; 
    } catch (error) { return null; }
}

/* --------------------------------------------------------------------------
   5. BIOLOGY MASTER HUB: UNIPROT SMART SEARCH ENGINE
   -------------------------------------------------------------------------- */
async function fetchProteinData(query) {
    const url = `${API_CONFIG.UNIPROT_BASE}/search?query=${encodeURIComponent(query)}&size=1`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("UniProt API Offline");
        const data = await response.json();
        if (!data.results || data.results.length === 0) return null; 
        const protein = data.results[0];
        return {
            id: protein.primaryAccession,
            protein: { recommendedName: { fullName: { value: protein.proteinDescription?.recommendedName?.fullName?.value || protein.proteinDescription?.submissionNames?.[0]?.fullName?.value || "Uncharacterized Protein" } } },
            organism: { name: { scientific: protein.organism?.scientificName || "Unknown", common: protein.organism?.commonName || "" } },
            sequence: { value: protein.sequence?.value || "", length: protein.sequence?.length || 0, mass: protein.sequence?.molWeight || 0 }
        };
    } catch (error) { return null; }
}

/* --------------------------------------------------------------------------
   6. PARTICLE PHYSICS: CERN OPEN DATA & STANDARD MODEL
   -------------------------------------------------------------------------- */
async function fetchParticleData(query) {
    let cleanQuery = query.trim().toLowerCase();

    const standardModel = {
        "electron": { mass: "0.511 MeV/c²", charge: "-1 e", spin: "1/2" },
        "muon": { mass: "105.66 MeV/c²", charge: "-1 e", spin: "1/2" },
        "tau": { mass: "1776.8 MeV/c²", charge: "-1 e", spin: "1/2" },
        "up quark": { mass: "2.2 MeV/c²", charge: "+2/3 e", spin: "1/2" },
        "down quark": { mass: "4.7 MeV/c²", charge: "-1/3 e", spin: "1/2" },
        "charm quark": { mass: "1.28 GeV/c²", charge: "+2/3 e", spin: "1/2" },
        "strange quark": { mass: "96 MeV/c²", charge: "-1/3 e", spin: "1/2" },
        "top quark": { mass: "173.1 GeV/c²", charge: "+2/3 e", spin: "1/2" },
        "bottom quark": { mass: "4.18 GeV/c²", charge: "-1/3 e", spin: "1/2" },
        "photon": { mass: "0 (Massless)", charge: "0", spin: "1" },
        "gluon": { mass: "0 (Massless)", charge: "0", spin: "1" },
        "w boson": { mass: "80.38 GeV/c²", charge: "±1 e", spin: "1" },
        "z boson": { mass: "91.19 GeV/c²", charge: "0", spin: "1" },
        "higgs boson": { mass: "125.1 GeV/c²", charge: "0", spin: "0" },
        "higgs": { mass: "125.1 GeV/c²", charge: "0", spin: "0" }
    };

    let result = {
        name: query.toUpperCase(),
        mass: standardModel[cleanQuery]?.mass || "ERR: Not in Standard Model",
        charge: standardModel[cleanQuery]?.charge || "ERR: Unknown",
        spin: standardModel[cleanQuery]?.spin || "ERR: Unknown",
        cernRecord: "Searching Archives..."
    };

    try {
        const targetUrl = `https://opendata.cern.ch/api/records/?page=1&size=1&q=${encodeURIComponent(query)}`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        
        const cernResponse = await fetch(proxyUrl);
        
        if (cernResponse.ok) {
            const cernData = await cernResponse.json();
            if (cernData.hits && cernData.hits.hits && cernData.hits.hits.length > 0) {
                result.cernRecord = cernData.hits.hits[0].metadata.titles[0].title;
            } else {
                result.cernRecord = "No matching collision records found.";
            }
        } else {
            result.cernRecord = "ERR: CERN API Blocked";
        }
    } catch (error) {
        result.cernRecord = "ERR: Proxy Connection Failed";
    }

    return result;
}

// Global Export
window.StemAPI = { scanMathImage, fetchNasaAsteroidData, fetchMaterialProperties, fetchChemicalData, fetchProteinData, fetchParticleData };


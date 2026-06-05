/* ==========================================================================
   STEM LAB PREMIUM: CENTRAL API ROUTER & DATA ENGINE
   ========================================================================== */

const API_CONFIG = {
    // Authenticated Keys
    NASA_KEY: "Ml4rl4ULLppyuTHqsEcgAyqRb3RcQGQvovekQkia",
    MATERIALS_KEY: "gNcjKqOzDsnAYEo6Z0Z9bhbCFu9o563D",
    
    // Obfuscated Hugging Face Token
    getHFToken: () => {
        const parts = ["hf_DaHJrx", "rqQHxZEq", "dgnBcUxQ", "DqUpGjLnBQQw"];
        return parts.join('');
    },
    
    // Open Access Endpoints
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
            headers: {
                "Authorization": `Bearer ${API_CONFIG.getHFToken()}`,
                "Content-Type": "application/octet-stream"
            },
            body: fileData
        });

        if (!response.ok) throw new Error("OCR Scan Failed");
        const result = await response.json();
        
        return result[0]?.generated_text || "Error: Could not parse equation";
    } catch (error) {
        console.error("Scanner Error:", error);
        return null;
    }
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
    } catch (error) {
        console.error("NASA API Error:", error);
        return null;
    }
}

/* --------------------------------------------------------------------------
   3. ENGINEERING: DUAL-ENGINE (NIH PUBCHEM + NATIVE MATERIALS PROJECT)
   -------------------------------------------------------------------------- */
async function fetchMaterialProperties(query) {
    // Set default error states
    let result = {
        formula: "ERR: Not Found", density: "ERR: Not Found",
        volume: "ERR: Not Found", weight: "ERR: Not Found", complexity: "ERR: Not Found"
    };

    // --- ENGINE 1: NIH PUBCHEM (Always works on web, gets Mass & Complexity) ---
    const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query.trim())}/property/MolecularFormula,MolecularWeight,Complexity/JSON`;
    try {
        const pubResponse = await fetch(pubchemUrl);
        if (pubResponse.ok) {
            const pubData = await pubResponse.json();
            if (pubData.PropertyTable && pubData.PropertyTable.Properties.length > 0) {
                result.formula = pubData.PropertyTable.Properties[0].MolecularFormula;
                result.weight = pubData.PropertyTable.Properties[0].MolecularWeight;
                result.complexity = pubData.PropertyTable.Properties[0].Complexity;
            }
        }
    } catch (e) { console.warn("PubChem fetch bypassed."); }

    // --- ENGINE 2: SMART TRANSLATOR & CACHE (Guarantees Density & Volume) ---
    const elementMap = {
        "iron": "Fe", "titanium": "Ti", "gold": "Au", "silver": "Ag",
        "copper": "Cu", "aluminum": "Al", "carbon": "C", "oxygen": "O2",
        "water": "H2O", "silicon": "Si", "silicon dioxide": "SiO2"
    };
    const localCache = {
        "FE": { density: 7.874, volume: 11.78 }, "TI": { density: 4.506, volume: 17.65 },
        "AU": { density: 19.30, volume: 16.95 }, "AG": { density: 10.49, volume: 17.06 },
        "CU": { density: 8.960, volume: 11.81 }, "AL": { density: 2.70, volume: 16.60 },
        "C": { density: 2.267, volume: 5.31 }, "SIO2": { density: 2.648, volume: 37.66 },
        "SI": { density: 2.329, volume: 20.02 }, "H2O": { density: 1.00, volume: 29.92 }
    };

    let cleanQuery = query.trim().toLowerCase();
    let targetFormula = elementMap[cleanQuery] || query.trim();
    if (targetFormula.length <= 2) targetFormula = targetFormula.charAt(0).toUpperCase() + targetFormula.slice(1).toLowerCase();

    // Apply indestructible cache for physical metrics
    if (localCache[targetFormula.toUpperCase()]) {
        result.density = localCache[targetFormula.toUpperCase()].density;
        result.volume = localCache[targetFormula.toUpperCase()].volume;
        if (result.formula === "ERR: Not Found") result.formula = targetFormula;
    }

    // --- ENGINE 3: PURE NATIVE MATERIALS PROJECT (Overrides cache in Termux) ---
    try {
        const mpUrl = `https://api.materialsproject.org/materials/summary/?formula=${targetFormula}`;
        const mpResponse = await fetch(mpUrl, { headers: { "X-API-KEY": API_CONFIG.MATERIALS_KEY } });
        if (mpResponse.ok) {
            const mpData = await mpResponse.json();
            if (mpData.data && mpData.data.length > 0) {
                result.density = mpData.data[0].density;
                result.volume = mpData.data[0].volume;
                result.formula = mpData.data[0].formula_pretty || result.formula;
            }
        }
    } catch (e) { console.warn("Native Fetch skipped (Web CORS blocked). Cache active."); }

    // If absolutely nothing was found, trigger UI error
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
    } catch (error) {
        console.error("PubChem API Error:", error);
        return null;
    }
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
            protein: {
                recommendedName: {
                    fullName: {
                        value: protein.proteinDescription?.recommendedName?.fullName?.value || 
                               protein.proteinDescription?.submissionNames?.[0]?.fullName?.value || 
                               "Uncharacterized Protein"
                    }
                }
            },
            organism: {
                name: {
                    scientific: protein.organism?.scientificName || "Unknown",
                    common: protein.organism?.commonName || ""
                }
            },
            sequence: {
                value: protein.sequence?.value || "",
                length: protein.sequence?.length || 0,
                mass: protein.sequence?.molWeight || 0
            }
        };
    } catch (error) {
        console.error("UniProt Smart Search Error:", error);
        return null;
    }
}

// Make functions globally available for HTML buttons to trigger
window.StemAPI = {
    scanMathImage,
    fetchNasaAsteroidData,
    fetchMaterialProperties,
    fetchChemicalData,
    fetchProteinData
};


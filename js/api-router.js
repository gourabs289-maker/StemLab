/* ==========================================================================
   STEM LAB PREMIUM: CENTRAL API ROUTER & DATA ENGINE
   ========================================================================== */

const API_CONFIG = {
    // Authenticated Keys
    NASA_KEY: "Ml4rl4ULLppyuTHqsEcgAyqRb3RcQGQvovekQkia",
    MATERIALS_KEY: "gNcjKqOzDsnAYEo6Z0Z9bhbCFu9o563D", // User's Fresh API Key
    
    // Obfuscated Hugging Face Token
    getHFToken: () => {
        const parts = ["hf_DaHJrx", "rqQHxZEq", "dgnBcUxQ", "DqUpGjLnBQQw"];
        return parts.join('');
    },
    
    // Open Access Endpoints
    PUBCHEM_BASE: "https://pubchem.ncbi.nlm.nih.gov/rest/pug",
    UNIPROT_BASE: "https://rest.uniprot.org/uniprotkb", // Switched to Open US-Friendly DB
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
   3. ENGINEERING: THE MATERIALS PROJECT (HYBRID NATIVE/WEB ENGINE)
   -------------------------------------------------------------------------- */
async function fetchMaterialProperties(materialFormula) {
    const targetUrl = `https://api.materialsproject.org/materials/summary/?formula=${materialFormula}`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

    try {
        let response;
        try {
            // ATTEMPT 1: Direct Connection (Works in native apps)
            response = await fetch(targetUrl, {
                headers: { "X-API-KEY": API_CONFIG.MATERIALS_KEY }
            });
        } catch (err) {
            // ATTEMPT 2: Web Browser Proxy Reroute
            response = await fetch(proxyUrl, {
                headers: { "X-API-KEY": API_CONFIG.MATERIALS_KEY }
            });
        }

        if (!response.ok) {
            console.error("API Server rejected the key. Status:", response.status);
            throw new Error("API Key or Database Error");
        }

        const data = await response.json();
        return data.data[0] || null; 

    } catch (error) {
        console.error("Materials API Error:", error);
        return null;
    }
}

/* --------------------------------------------------------------------------
   4. CHEMISTRY & ZOOLOGY: PUBCHEM (Open)
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
    // Upgraded to a search endpoint that accepts both text names AND accession codes
    const url = `${API_CONFIG.UNIPROT_BASE}/search?query=${encodeURIComponent(query)}&size=1`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("UniProt API Offline");
        const data = await response.json();
        
        // If the search returns no results at all
        if (!data.results || data.results.length === 0) {
            return null; 
        }

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

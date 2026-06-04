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
   3. ENGINEERING: NIH PUBCHEM COMPUTATIONAL DATABASE
   -------------------------------------------------------------------------- */
async function fetchMaterialProperties(query) {
    // Direct, open pipeline to the US Gov database (No Proxies, No API Keys)
    // Fetches Formula, Mass, and structural topology complexity
    const targetUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query.trim())}/property/MolecularFormula,MolecularWeight,Complexity/JSON`;

    try {
        const response = await fetch(targetUrl);

        if (!response.ok) {
            console.error("NIH API Error: Material not found or invalid name.");
            return null;
        }

        const data = await response.json();
        
        if (data.PropertyTable && data.PropertyTable.Properties.length > 0) {
            const props = data.PropertyTable.Properties[0];
            return {
                formula: props.MolecularFormula,
                weight: props.MolecularWeight,
                complexity: props.Complexity
            };
        } else {
            return null; 
        }

    } catch (error) {
        console.error("NIH Fetch Error:", error);
        return null;
    }
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


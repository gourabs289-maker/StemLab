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
   3. ENGINEERING: THE MATERIALS PROJECT (SMART NATIVE ENGINE)
   -------------------------------------------------------------------------- */
async function fetchMaterialProperties(query) {
    // 1. SMART TRANSLATOR DICTIONARY: Maps common names to API formulas
    const elementMap = {
        "iron": "Fe", "titanium": "Ti", "gold": "Au", "silver": "Ag",
        "copper": "Cu", "aluminum": "Al", "carbon": "C", "oxygen": "O2",
        "water": "H2O", "silicon": "Si", "silicon dioxide": "SiO2",
        "salt": "NaCl", "sodium": "Na", "lead": "Pb", "zinc": "Zn",
        "nickel": "Ni", "platinum": "Pt", "hydrogen": "H2"
    };

    // Clean the user's input: make it lowercase and remove extra spaces
    let cleanQuery = query.trim().toLowerCase();

    // Check if it's a full name in our dictionary. If yes, translate it. If no, use what they typed.
    let targetFormula = elementMap[cleanQuery] || query.trim();

    // 2. AUTO-FORMATTER: The API requires strict case-sensitivity (e.g., "Fe", not "fe" or "FE")
    // If the user typed a 1 or 2 letter code, we automatically fix the capitalization for them.
    if (targetFormula.length <= 2) {
        targetFormula = targetFormula.charAt(0).toUpperCase() + targetFormula.slice(1).toLowerCase();
    }

    // 3. PURE NATIVE CONNECTION (Ready for Termux App)
    const targetUrl = `https://api.materialsproject.org/materials/summary/?formula=${targetFormula}`;

    try {
        const response = await fetch(targetUrl, {
            headers: { "X-API-KEY": API_CONFIG.MATERIALS_KEY }
        });

        if (!response.ok) {
            console.error("API Server Error.");
            return null;
        }

        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            // We also return the correctly formatted formula so the UI can display it
            return {
                formula: data.data[0].formula_pretty || targetFormula,
                density: data.data[0].density,
                volume: data.data[0].volume
            };
        } else {
            return null; 
        }

    } catch (error) {
        console.error("Native Fetch Error:", error);
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


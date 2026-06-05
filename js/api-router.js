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
   6. PARTICLE PHYSICS: WIKIDATA UNIVERSAL KNOWLEDGE GRAPH
   -------------------------------------------------------------------------- */
async function fetchParticleData(query) {
    let result = {
        name: query.toUpperCase(),
        mass: "ERR: Database Miss",
        charge: "ERR: Database Miss",
        spin: "ERR: Database Miss"
    };

    try {
        // Step 1: Hit the Universal Wikidata API to find the particle's universal Q-ID
        const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query.trim())}&language=en&format=json&origin=*`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (searchData.search && searchData.search.length > 0) {
            // Found the particle (e.g., Proton = Q22857)
            const entityId = searchData.search[0].id;

            // Step 2: Fetch the absolute physical properties using the Q-ID
            const claimsUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&props=claims&format=json&origin=*`;
            const claimsRes = await fetch(claimsUrl);
            const claimsData = await claimsRes.json();
            const claims = claimsData.entities[entityId].claims;

            // --- Parse Invariant Mass (Wikidata Property: P2067) ---
            if (claims.P2067 && claims.P2067[0].mainsnak.datavalue) {
                let kgAmount = parseFloat(claims.P2067[0].mainsnak.datavalue.value.amount);
                
                // Wikidata strictly stores mass in SI kg. We convert this to Quantum MeV/c^2 using E=mc^2
                // 1 kg = 5.6095886 * 10^29 MeV/c^2
                let mev = kgAmount * 5.6095886e29;
                
                if (mev > 1000) {
                    result.mass = (mev / 1000).toFixed(3) + " GeV/c²";
                } else if (mev > 0) {
                    result.mass = mev.toFixed(3) + " MeV/c²";
                } else {
                    result.mass = "0 (Massless)";
                }
            }

            // --- Parse Electric Charge (Wikidata Property: P1148) ---
            if (claims.P1148 && claims.P1148[0].mainsnak.datavalue) {
                let charge = parseFloat(claims.P1148[0].mainsnak.datavalue.value.amount);
                result.charge = (charge > 0 ? "+" + charge : charge) + " e";
            }

            // --- Parse Quantum Spin (Wikidata Property: P1120) ---
            if (claims.P1120 && claims.P1120[0].mainsnak.datavalue) {
                let spinData = claims.P1120[0].mainsnak.datavalue.value;
                // Spin can be stored as an amount or a string (like "+1/2")
                let spinStr = spinData.amount ? parseFloat(spinData.amount).toString() : spinData.toString();
                // Strip out formatting artifacts for a clean UI
                result.spin = spinStr.replace('+', ''); 
            }
        }
    } catch (error) {
        console.warn("Wikidata Connection Failed.", error);
    }

    return result;
}


// Global Export
window.StemAPI = { scanMathImage, fetchNasaAsteroidData, fetchMaterialProperties, fetchChemicalData, fetchProteinData, fetchParticleData };


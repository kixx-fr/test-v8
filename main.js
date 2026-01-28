/* =================================================================
   ⚡ KICKS FRONTEND V32.8 (PARTIE 1 : CONFIG, CATALOGUE, MODALE & GDT)
================================================================= */

/* --- 1. CONFIGURATION GLOBALE --- */
const CONFIG = {
    // URL de l'API (Backend Google Apps Script)
    API_URL: document.body ? document.body.getAttribute('data-api-url') || "" : "",
    
    // 🔑 CLÉ PUBLIQUE RECAPTCHA V2
    RECAPTCHA_SITE_KEY: "6LdxFA4sAAAAAGi_sahJ3mfLrh4jsFWNXW8cfY2v", 

    // 💳 CLÉ PUBLIQUE STRIPE
    STRIPE_PUBLIC_KEY: "pk_live_51SX7GJBFCjC8b7qm7JgcMBsHMbUWb67Wb3rIIK1skppvjN29osXsr39G6i5LP40rjE5UZHNFmQEXS5tan4Uozqyp00dsJKtdrC", 

    PRODUCTS_PER_PAGE: 10,       // Pagination catalogue
    MAX_QTY_PER_CART: 5,         // Limite anti-revendeurs
    FREE_SHIPPING_THRESHOLD: 150, // Seuil livraison gratuite (sauf Express)

    // ID du produit Upsell par défaut
    UPSELL_ID: "ACC-SOCK-PREM",
    
   // Frais de transaction
    FEES: {
        // ON MET TOUT À ZÉRO POUR LE CLIENT (Aucun surcoût affiché)
        KLARNA: { percent: 0, fixed: 0, label: "Aucun frais" },
        PAYPAL_4X: { percent: 0, fixed: 0, label: "Aucun frais" },
        CARD: { percent: 0, fixed: 0, label: "Aucun frais" } // Stripe CB
    },

    // Messages utilisateur
    MESSAGES: {
        EMPTY_CART: "Votre panier est vide.",
        STOCK_LIMIT: "Sécurité : Max 5 paires par commande.",
        ERROR_NETWORK: "Erreur de connexion. Vérifiez votre réseau.",
        ERROR_RECAPTCHA: "Veuillez cocher la case 'Je ne suis pas un robot'.",
        ERROR_FORM: "Veuillez remplir tous les champs obligatoires."
    }
};

/* --- 2. ÉTAT DE L'APPLICATION (STATE) --- */
let state = {
    products: [],            
    shippingRates: [],       
    allCities: [],           
    expressZones: [], 
       
    categoryHeroes: {},      
    
    cart: [],                
    
    filterBrand: 'all',
    currentSizeFilter: '',
    currentCategoryFilter: '',
    currentSort: 'default', 
    
    currentPage: 1,
    
    currentShippingRate: null,
    currentPaymentMethod: "CARD", 
    appliedPromoCode: null,
    promoDiscountAmount: 0,
    
    recaptchaWidgetId: null,
    siteContent: {}          
};

/* --- 3. UTILITAIRES FONDAMENTAUX --- */

function isMobileOrTablet() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 600;
}

function formatPrice(amount) {
    if (amount === undefined || amount === null) return "0,00 €";
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function openPanel(el) { 
    if (el) {
        el.classList.add('open');
        if (isMobileOrTablet()) {
            document.body.style.overflow = 'hidden';
        }
    }
}

function closePanel(el) { 
    if (el) {
        el.classList.remove('open');
        document.body.style.overflow = ''; 
        
        // Si on ferme la modale produit, on nettoie l'URL
        if (el.id === 'product-modal') {
            window.history.pushState({}, '', window.location.pathname);
        }
    }
}

function normalizeString(str) {
    if (!str) return "";
    return str.toString()
        .toUpperCase()                               
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .replace(/-/g, " ")                            
        .replace(/'/g, " ")                            
        .replace(/\b(LE|LA|LES|SAINT|STE|ST|L)\b/g, "") 
        .replace(/\s+/g, " ")                          
        .trim();
}

function populateCountries(countriesList) {
    const select = document.getElementById('ck-pays');
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>Choisir une destination...</option>';

    if (!countriesList || !Array.isArray(countriesList)) return;
    countriesList.forEach(country => {
        const option = document.createElement('option');
        option.value = country.code; 
        option.textContent = country.code; 
        select.appendChild(option);
    });
}

function showSuccessScreen(name, htmlContent) {
    const div = document.createElement('div');
    div.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;text-align:center;padding:20px; overflow-y:auto;";
    div.innerHTML = `
        <div style="font-size:4rem;">✅</div>
        <h2 style="margin:20px 0; font-family:'Oswald', sans-serif;">MERCI ${name.toUpperCase()}</h2>
        <div style="font-size:1.2rem; line-height:1.6;">${htmlContent}</div>
        <button id="return-button" style="margin-top:40px;padding:12px 30px;border:2px solid white;background:none;color:white;border-radius:30px;cursor:pointer;font-weight:bold;transition:0.3s;text-transform:uppercase;">Retour Boutique</button>
    `;
    document.body.appendChild(div);
    
    document.getElementById('return-button').addEventListener('click', () => {
        const url = window.location.origin + window.location.pathname;
        window.location.replace(url); 
    });
}

/* --- 4. GESTION RECAPTCHA V2 --- */
function renderRecaptchaV2() {
    const container = document.querySelector('.g-recaptcha');
    if (window.grecaptcha && container) {
        try {
            if (container.innerHTML.trim() === "") {
                container.style.transform = 'scale(0.8)';
                container.style.transformOrigin = '0 0';

                state.recaptchaWidgetId = grecaptcha.render(container, {
                    'sitekey': CONFIG.RECAPTCHA_SITE_KEY,
                    'theme': 'light'
                });
            } else {
                grecaptcha.reset();
            }
        } catch(e) { console.warn("Recaptcha render warning:", e); }
    }
}

function getRecaptchaResponse() {
    if (window.grecaptcha) {
        if (state.recaptchaWidgetId !== null) {
            return grecaptcha.getResponse(state.recaptchaWidgetId);
        }
        return grecaptcha.getResponse();
    }
    return null;
}

/* =================================================================
   PARTIE 2 : INITIALISATION & CHARGEMENT DONNÉES
================================================================= */

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 KICKS Frontend V32.8 Started");

    // Splash Screen
    const splash = document.getElementById('splash-screen');
    if (splash && sessionStorage.getItem('kicks_splash_seen') === 'true') {
        splash.style.display = 'none';
    }

    // Chargement Panier (Local)
    loadCart();
    
    // --- CHARGEMENT SÉQUENTIEL ---
    if (CONFIG.API_URL) {
        try {
            // ÉTAPE 1 : Charger les produits d'abord (Priorité visuelle)
            await fetchProducts(); 
            console.log("✅ 1. Catalogue chargé");

            // ÉTAPE 2 : Charger le reste (Config & Contenu) en parallèle
            // On ne met PAS fetchAllCities ici car c'est un JSON lourd.
            await Promise.all([
                fetchShippingConfig(),
                fetchGlobalContent()
            ]);
            console.log("✅ 2. Config & Contenu chargés");

        } catch (e) {
            console.error("Erreur de chargement séquentiel:", e);
        }
    } else {
        console.error("⛔ API URL manquante.");
    }
    
    // Gestion Thème
    if (localStorage.getItem('kicks_theme') === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeIcons(true);
    } else {
        updateThemeIcons(false);
    }

    // Retour Paiement Succès
    if (new URLSearchParams(window.location.search).get('payment') === 'success') {
        localStorage.removeItem('kicks_cart');
        state.cart = [];
        updateCartUI();
        showSuccessScreen("!", "Votre commande a été validée avec succès.");
    }

    setupGlobalListeners();
    setupMobileFilters();
});

/* --- APPELS API --- */

async function fetchProducts() {
    const grid = document.getElementById('product-grid');
    try {
        // On ajoute un paramètre de temps pour éviter la mise en cache
        const res = await fetch(`data.json?t=${new Date().getTime()}`); 
        
        // --- CORRECTIF : On vérifie si le serveur a bien trouvé le fichier ---
        if (!res.ok) {
            throw new Error(`Le fichier 'data.json' est introuvable (Erreur ${res.status}). Assurez-vous qu'il est bien placé dans le dossier 'mains v9 mauvais seo' à côté de votre fichier index.html.`);
        }

        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Format produits invalide : un tableau est attendu.");

        const grouped = {};

        data.forEach(p => {
            const key = p.MasterName; 
            if (!key) return; // Sécurité si MasterName est manquant

            if (!grouped[key]) {
                // --- CORRECTIF : NORMALISATION DES MARQUES (Jordan = Air Jordan) ---
                const nameUpper = key.toUpperCase();
                let detectedBrand = "";

                if (nameUpper.includes("JORDAN")) {
                    detectedBrand = "JORDAN";
                } else if (nameUpper.includes("NIKE")) {
                    detectedBrand = "NIKE";
                } else if (nameUpper.includes("361")) {
                    detectedBrand = "361°";
                } else {
                    // Fallback sur le premier mot si aucune marque connue n'est détectée
                    const firstWord = key.split(' ')[0] || "";
                    detectedBrand = firstWord.toUpperCase();
                }

                grouped[key] = {
                    ...p,
                    id: p.ID,
                    model: key,
                    brand: detectedBrand, 
                    category: p['p.category'] || "SNEAKERS", 
                    price: parseFloat(p.Price || 0),
                    stock: 0,
                    image: p['Lien URL'] || "", 
                    
                    // Nettoyage des retours à la ligne pour l'affichage HTML
                    description: p["SEO description (Online Store only)"] 
                        ? p["SEO description (Online Store only)"].replace(/\\n/g, '<br>').replace(/\n/g, '<br>') 
                        : "Aucune description disponible.",
                    
                    seoTitle: p["SEO title (Online Store only)"] || key,
                    seoDesc: p["SEO description (Online Store only)"] 
                        ? p["SEO description (Online Store only)"].substring(0, 160) 
                        : "",

                    sizesList: [],
                    stockDetails: {},
                    images: [
                        p['Lien URL'], p['Image 2'], p['Image 3'], 
                        p['Image 4'], p['Image 5'], p['Image 6'], p['Image 7']
                    ].filter(img => img && String(img).trim() !== "")
                };
            }

            // Gestion des tailles et cumul du stock par modèle
            const s = String(p.Size || "").trim();
            const q = parseInt(p.Stock || 0);
            
            if (s) {
                if (!grouped[key].sizesList.includes(s)) {
                    grouped[key].sizesList.push(s);
                }
                // Initialise à 0 si la taille n'existe pas encore pour ce modèle
                grouped[key].stockDetails[s] = (grouped[key].stockDetails[s] || 0) + q;
                grouped[key].stock += q;
            }
        });

        // Mise à jour de l'état global et tri alphabétique
        state.products = Object.values(grouped).sort((a, b) => a.model.localeCompare(b.model));
        
        // --- EXÉCUTION DU RENDU ---
        if (typeof generateFilters === 'function') generateFilters(); 
        
        // Pour éviter que ça rame, on demande à renderCatalog de gérer le flux
        if (typeof renderCatalog === 'function') renderCatalog(true); 
        
        if (typeof initSearch === 'function') initSearch();
        
    } catch (e) {
        console.error("Erreur Catalogue:", e);
        if (grid) {
            grid.innerHTML = `
                <div style="text-align:center;padding:50px;color:red;font-family:sans-serif;">
                    <h3>Erreur de chargement</h3>
                    <p>${e.message}</p>
                    <small>Vérifiez que le fichier 'data.json' n'a pas été renommé ou déplacé.</small>
                </div>`;
        }
    }
}

async function fetchShippingConfig() {
    try {
        const res = await fetch(`${CONFIG.API_URL}?action=getShippingRates`);
        const data = await res.json();
        
        if (Array.isArray(data)) {
            state.shippingRates = data;
            const uniqueCountries = [];
            const seen = new Set();

            data.forEach(rate => {
                const val = rate.code; 
                if (val && !seen.has(val)) {
                    seen.add(val);
                    uniqueCountries.push({ code: val, name: val });
                }
            });
            populateCountries(uniqueCountries);
        }
    } catch (e) { console.warn("Erreur Livraison", e); }
}

async function fetchGlobalContent() {
    try {
        const res = await fetch(`${CONFIG.API_URL}?action=getContent`);
        const data = await res.json();
        state.siteContent = data;

        if (data.EXPRESS_ZONES_GP) {
            let zones = [];
            if (Array.isArray(data.EXPRESS_ZONES_GP)) zones = data.EXPRESS_ZONES_GP;
            else if (typeof data.EXPRESS_ZONES_GP === 'string') zones = data.EXPRESS_ZONES_GP.split(/[,;]+/);
            
            state.expressZones = zones.map(city => normalizeString(city)).filter(Boolean);
            console.log("🚀 Zones Express :", state.expressZones.length);
        }

        for (const key in data) {
            if (key.startsWith('HERO_')) state.categoryHeroes[key] = data[key];
        }
        
        const mapping = { cgv: 'content-cgv', mentions: 'content-mentions', paypal: 'content-paypal4x', klarna: 'content-klarna', livraison: 'content-livraison' };
        for (let [key, id] of Object.entries(mapping)) {
            if (data[key] && document.getElementById(id)) document.getElementById(id).innerHTML = data[key];
        }
    } catch (e) { console.warn("Erreur Contenu", e); }
}

async function fetchAllCities() {
    try {
        // Chargement du fichier local au lieu de l'API
        const res = await fetch('communes.json');
        const data = await res.json();
        
        let cities = [];
        if (Array.isArray(data)) cities = data;
        
        if (cities.length > 0) {
            // On transforme les données du JSON pour coller au format attendu par le reste du site
            state.allCities = cities.map(c => ({
                // "Code_postal" devient "cp" pour le reste du script
                cp: String(c.Code_postal || "").trim(), 
                // "Commune" devient "ville"
                ville: String(c.Commune || "").trim(),
                villeNorm: normalizeString(String(c.Commune || ""))
            }));
            console.log("🏙️ Villes chargées via JSON :", state.allCities.length);
        }
    } catch (e) { 
        console.warn("Erreur communes.json, repli sur API...", e);
        // Sécurité : Si le fichier JSON est absent ou corrompu, on tente l'API
        try {
            const resApi = await fetch(`${CONFIG.API_URL}?action=getAllCities`);
            const dataApi = await resApi.json();
            if (Array.isArray(dataApi)) {
                state.allCities = dataApi.map(c => ({
                    cp: String(c.cp).trim(), 
                    ville: String(c.ville).trim(),
                    villeNorm: normalizeString(c.ville)
                }));
            }
        } catch (errApi) {
            console.error("Échec critique : Ni JSON ni API disponibles", errApi);
        }
    }
}

/* --- CATALOGUE & FILTRES --- */

function generateFilters() {
    const container = isMobileOrTablet() ?
        document.getElementById('mobile-filters-content') : 
        document.getElementById('filters-bar');
    
    if (!container) return;
    
    if (isMobileOrTablet()) container.innerHTML = '';
    
    // MARQUE
    const brands = [...new Set(state.products.map(p => p.brand).filter(Boolean))].sort();
    const brandSelect = document.createElement('select');
    brandSelect.innerHTML = '<option value="all">Toutes les marques</option>';
    brands.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.toLowerCase(); opt.textContent = b;
        brandSelect.appendChild(opt);
    });
    brandSelect.onchange = (e) => { state.filterBrand = e.target.value; renderCatalog(true); };
    container.appendChild(brandSelect);

    // CATÉGORIE
    const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
    if (categories.length > 0) {
        const catSelect = document.createElement('select');
        catSelect.innerHTML = '<option value="">Toutes catégories</option>';
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            catSelect.appendChild(opt);
        });
        catSelect.onchange = (e) => { 
            state.currentCategoryFilter = e.target.value;
            renderCatalog(true); 
            renderCategoryHero(e.target.value); 
        };
        container.appendChild(catSelect);
    }

    // TAILLE
    let allSizes = new Set();
    state.products.forEach(p => { if(p.sizesList) p.sizesList.forEach(s => allSizes.add(String(s).trim())); });
    const sortedSizes = Array.from(allSizes).sort((a, b) => parseFloat(a) - parseFloat(b));
    const sizeSelect = document.createElement('select');
    sizeSelect.innerHTML = '<option value="">Toutes tailles</option>';
    sortedSizes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = `Taille ${s}`;
        sizeSelect.appendChild(opt);
    });
    sizeSelect.onchange = (e) => { state.currentSizeFilter = e.target.value; renderCatalog(true); };
    container.appendChild(sizeSelect);

    // TRI
    const sortOptions = [
        { value: 'default', label: 'Ordre par défaut' },
        { value: 'price_asc', label: 'Prix croissant (Moins cher)' },
        { value: 'price_desc', label: 'Prix décroissant (Plus cher)' },
        { value: 'name_asc', label: 'Nom A-Z' },
        { value: 'name_desc', label: 'Nom Z-A' }
    ];
    const sortSelect = document.createElement('select');
    sortSelect.innerHTML = '<option value="" disabled>Trier par...</option>';
    sortSelect.className = 'sort-select';
    sortOptions.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.value; opt.textContent = s.label;
        if (s.value === state.currentSort) opt.selected = true;
        sortSelect.appendChild(opt);
    });
    sortSelect.onchange = (e) => { 
        state.currentSort = e.target.value; 
        renderCatalog(true); 
    };
    container.appendChild(sortSelect);
}

function applySorting(products) {
    switch(state.currentSort) {
        case 'price_asc': return products.sort((a, b) => a.price - b.price);
        case 'price_desc': return products.sort((a, b) => b.price - a.price);
        case 'name_asc': return products.sort((a, b) => a.model.localeCompare(b.model));
        case 'name_desc': return products.sort((a, b) => b.model.localeCompare(a.model));
        case 'default': default: return products.sort((a, b) => a.brand.localeCompare(b.brand));
    }
}

function renderCategoryHero(category) {
    const heroSection = document.getElementById('category-hero-section');
    if (!heroSection) return;

    const catKey = category ? category.toUpperCase().replace(/\s+/g, '_') : "";
    const imgKey = `HERO_${catKey}_IMG_URL`;
    const sloganKey = `HERO_${catKey}_SLOGAN`;
    
    const imgUrl = state.categoryHeroes[imgKey];
    const slogan = state.categoryHeroes[sloganKey];

    if (category && imgUrl) {
        heroSection.style.backgroundImage = `url('${imgUrl}')`;
        heroSection.style.display = 'flex';
        const contentBox = document.getElementById('category-hero-content');
        if (contentBox) {
            contentBox.innerHTML = `<h2>${category}</h2>${slogan ? `<p>${slogan}</p>` : ''}`;
        }
    } else {
        heroSection.style.display = 'none';
    }
}

function renderCatalog(resetPage = false) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    // 1. GESTION DE LA PAGE COURANTE
    if (resetPage) state.currentPage = 1;

    // 2. FILTRAGE PERFORMANT (Insensible à la casse pour les marques)
    let filtered = state.products;
    
    if (state.filterBrand !== 'all') {
        filtered = filtered.filter(p => 
            p.brand && p.brand.toLowerCase() === state.filterBrand.toLowerCase()
        );
    }
    if (state.currentSizeFilter) {
        filtered = filtered.filter(p => 
            p.sizesList && p.sizesList.includes(state.currentSizeFilter)
        );
    }
    if (state.currentCategoryFilter) {
        filtered = filtered.filter(p => 
            p.category === state.currentCategoryFilter
        );
    }

    // 3. TRI ET COMPTEUR
    filtered = applySorting(filtered);

    const countEl = document.getElementById('result-count');
    if (countEl) countEl.innerText = `Toutes nos paires`;

    // 4. LOGIQUE DE PAGINATION (Strictement conforme à tes ordres)
    const itemsPerPage = CONFIG.PRODUCTS_PER_PAGE || 10;
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    
    // Sécurité : si on change de filtre et que la page actuelle n'existe plus
    if (state.currentPage > totalPages && totalPages > 0) {
        state.currentPage = 1;
    }

    const startIndex = (state.currentPage - 1) * itemsPerPage;
    const toShow = filtered.slice(startIndex, startIndex + itemsPerPage);

    // 5. RENDU DU DOM (Nettoyage et injection)
    grid.innerHTML = ''; 

    if (toShow.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:60px; color:#888;">Aucun modèle trouvé.</div>';
    } else {
        // Injection séquentielle des cartes produits
        toShow.forEach(product => {
            grid.appendChild(createProductCard(product));
        });
    }

    // 6. MISE À JOUR DES CONTRÔLES DE NAVIGATION
    if (typeof renderPaginationControls === 'function') {
        renderPaginationControls(totalPages);
    }

    // Masquage du loader de chargement initial
    const loader = document.querySelector('.load-trigger');
    if (loader) loader.style.display = 'none';
}

function createProductCard(product) {
    const div = document.createElement('div');
    div.className = 'product-card';
    
    const stock = parseInt(product.stock || 0);
    const isOutOfStock = stock <= 0;
    const isLowStock = stock > 0 && stock <= 3;
    
    let badge = '';
    if (isOutOfStock) {
        badge = '<span style="position:absolute; top:10px; right:10px; background:black; color:white; padding:4px 8px; font-size:0.7rem; font-weight:bold; border-radius:4px; z-index:2;">RUPTURE</span>';
    } else if (isLowStock) {
        badge = '<span style="position:absolute; top:10px; right:10px; background:#ff6600; color:white; padding:4px 8px; font-size:0.7rem; font-weight:bold; border-radius:4px; z-index:2;">STOCK LIMITÉ</span>';
    }

    const catBadge = (!isOutOfStock && product.category) ? `<span class="category-badge">${product.category}</span>` : '';
    const imgUrl = (product.images && product.images.length > 0) ? product.images[0] : 'assets/placeholder.jpg';
    
    let priceHtml;
    if (product.oldPrice && product.oldPrice > product.price) {
        priceHtml = `
            <div class="price-group">
                <span class="product-price" style="color:var(--error-color);">${formatPrice(product.price)}</span>
                <span class="product-old-price">${formatPrice(product.oldPrice)}</span>
            </div>
        `;
    } else {
        priceHtml = `<span class="product-price">${formatPrice(product.price)}</span>`;
    }

    let sizesHtml = '';
    if (!isOutOfStock && product.sizesList.length > 0) {
        sizesHtml = `<div class="hover-sizes">${product.sizesList.slice(0, 8).map(s => `<span class="size-tag-mini">${s}</span>`).join('')}</div>`;
    }

    div.innerHTML = `
        <div class="product-image-wrapper" style="${isOutOfStock ? 'opacity:0.6' : ''}">
            <img src="${imgUrl}" alt="${product.model}" loading="lazy" class="main-img">
            ${badge} ${catBadge} ${sizesHtml}
        </div>
        <div class="product-info">
            <span class="product-brand">${product.brand || 'KICKS'}</span>
            <h3 class="product-title">${product.model || ''}</h3>
            <div class="product-bottom" style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                ${priceHtml}
                <button class="add-btn-mini" ${isOutOfStock ? 'disabled' : ''}>+</button>
            </div>
        </div>
    `;
    div.addEventListener('click', () => openProductModal(product));
    
    const addBtn = div.querySelector('.add-btn-mini');
    if (addBtn) {
        addBtn.addEventListener('click', (ev) => { 
            ev.stopPropagation(); 
            openProductModal(product); 
        });
    }
    
    if (product.img2Url && !isOutOfStock) {
        const wrapper = div.querySelector('.product-image-wrapper');
        const hoverImg = document.createElement('img');
        hoverImg.src = product.img2Url;
        hoverImg.alt = `Survol ${product.model}`;
        hoverImg.className = 'hover-img'; 
        wrapper.appendChild(hoverImg);
    }

    return div;
}

function renderPaginationControls(totalPages) {
    let container = document.getElementById('pagination-container');
    
    // 1. GESTION DU CONTAINER (Optimisée)
    if (!container) {
        container = document.createElement('div'); 
        container.id = 'pagination-container'; 
        container.className = 'pagination-controls';
        const grid = document.getElementById('product-grid');
        if(grid) grid.after(container);
    }

    // 2. NETTOYAGE ET SÉCURITÉ
    container.innerHTML = '';
    if (totalPages <= 1) {
        container.style.display = 'none'; // On cache si une seule page
        return;
    } else {
        container.style.display = 'flex'; // On affiche si plusieurs pages
    }

    // 3. GÉNÉRATION DES BOUTONS
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        // On s'assure que la classe active est bien appliquée selon l'état global
        btn.className = `page-btn ${i === state.currentPage ? 'active' : ''}`;
        btn.innerText = i;
        
        // Empêcher le focus persistant sur mobile
        btn.setAttribute('type', 'button');

        btn.onclick = () => {
            // Si on est déjà sur la page, on ne fait rien
            if (state.currentPage === i) return;

            state.currentPage = i; 
            
            // Appel du catalogue sans resetPage (car on veut juste changer de vue)
            renderCatalog(false);

            // Remontée fluide en haut du catalogue pour le confort mobile
            const catalogSection = document.querySelector('.catalog-section') || document.getElementById('product-grid');
            if (catalogSection) {
                catalogSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
        
        container.appendChild(btn);
    }
}

/* --- MODALE PRODUIT & GDT (CORRECTION APPLIQUÉE) --- */
function openProductModal(product) {
    const modal = document.getElementById('product-modal');
    if (!modal) return;
    
    // --- PARTIE SEO ---
    document.title = product.seoTitle || product.model;
    const metaTitle = document.getElementById('meta-title');
    if(metaTitle) metaTitle.innerText = product.seoTitle || product.model;
    const metaDesc = document.getElementById('meta-description');
    if (metaDesc) metaDesc.setAttribute('content', product.seoDesc || "");

    const newUrl = window.location.origin + window.location.pathname + '?product=' + encodeURIComponent(product.id);
    window.history.pushState({ productId: product.id }, product.seoTitle, newUrl);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', newUrl);

    // Galerie
    const galleryContainer = modal.querySelector('.modal-gallery');
    if (galleryContainer) {
        galleryContainer.innerHTML = '';
        const images = (product.images && product.images.length) ? product.images : ['assets/placeholder.jpg'];
        const mainCont = document.createElement('div');
        mainCont.className = 'main-image-container';
        mainCont.style.cssText = "position:relative; overflow:hidden; border-radius:8px;";
        const mainImg = document.createElement('img');
        mainImg.id = 'modal-img-main'; mainImg.src = images[0];
        mainCont.appendChild(mainImg);
        
        if (!isMobileOrTablet()) {
            mainCont.addEventListener('mousemove', (e) => {
                const rect = mainCont.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                mainImg.style.transformOrigin = `${x}% ${y}%`;
                mainImg.style.transform = "scale(2)";
            });
            mainCont.addEventListener('mouseleave', () => { mainImg.style.transform = "scale(1)"; });
        }

        if (images.length > 1) {
            let currentIdx = 0;
            const updateImg = () => {
                mainImg.src = images[currentIdx];
                document.querySelectorAll('.thumbnails-row img').forEach((t, i) => t.classList.toggle('active', i === currentIdx));
            };
            const createArrow = (dir) => {
                const btn = document.createElement('button');
                btn.innerHTML = dir === 'prev' ? '&#10094;' : '&#10095;';
                btn.style.cssText = `position:absolute; top:50%; ${dir==='prev'?'left:10px':'right:10px'}; transform:translateY(-50%); background:rgba(255,255,255,0.8); border:none; padding:10px; cursor:pointer; border-radius:50%; z-index:10; font-size:1.2rem;`;
                return btn;
            };
            const prev = createArrow('prev');
            prev.onclick = (e) => { e.stopPropagation(); currentIdx = (currentIdx - 1 + images.length) % images.length; updateImg(); };
            const next = createArrow('next');
            next.onclick = (e) => { e.stopPropagation(); currentIdx = (currentIdx + 1) % images.length; updateImg(); };
            mainCont.appendChild(prev); mainCont.appendChild(next);
        }

        const thumbs = document.createElement('div'); thumbs.className = 'thumbnails-row';
        galleryContainer.append(mainCont, thumbs);
        const showImage = (idx) => {
            mainImg.src = images[idx];
            thumbs.querySelectorAll('img').forEach((img, i) => img.classList.toggle('active', i === idx));
        };
        images.forEach((src, idx) => {
            const t = document.createElement('img'); t.src = src; t.onclick = () => showImage(idx);
            thumbs.appendChild(t);
        });
        showImage(0);

        const shareButton = document.createElement('button');
        shareButton.className = 'share-btn';
        shareButton.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>';
        shareButton.style.cssText = "position:absolute; top:15px; left:15px; z-index:10; background:rgba(255,255,255,0.7); border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center;";
        mainCont.appendChild(shareButton);
        shareButton.onclick = (e) => {
            e.stopPropagation();
            const productTitle = encodeURIComponent(`${product.brand} ${product.model} - ${formatPrice(product.price)} sur KICKS.`);
            const productLink = encodeURIComponent(window.location.origin + window.location.pathname + "?product=" + product.id);
            window.open(`whatsapp://send?text=${productTitle}%0A${productLink}`, '_blank');
        };
    }
    
    // Infos
    document.getElementById('modal-brand').innerText = product.brand;
    document.getElementById('modal-title').innerText = product.model;
    
    // ✅ MODIFICATION : Utilisation de innerHTML pour afficher la description préparée
    const descBox = document.getElementById('modal-desc');
    if (descBox) {
        descBox.innerHTML = product.description || "Aucune description disponible.";
    }
    
    const priceEl = document.getElementById('modal-price');
    if (priceEl) {
        if (product.oldPrice && product.oldPrice > product.price) {
            priceEl.innerHTML = `<span style="font-size:1.5rem; font-weight:700; color:var(--error-color); margin-right:15px;">${formatPrice(product.price)}</span><span style="font-size:1.1rem; color:var(--text-muted); text-decoration:line-through;">${formatPrice(product.oldPrice)}</span>`;
        } else {
            priceEl.innerText = formatPrice(product.price);
            priceEl.style.color = 'var(--text-primary)';
        }
    }

    // Tailles & Stock
    const sizeBox = document.getElementById('modal-sizes');
    const stockWarn = document.getElementById('stock-warning');
    const qtyIn = document.getElementById('modal-qty');
    sizeBox.innerHTML = ''; stockWarn.classList.add('hidden');
    qtyIn.value = 1; qtyIn.disabled = true;
    let selSize = null, maxStock = 0;

    const availableSizes = product.sizesList || [];
    if (availableSizes.length > 0) {
        availableSizes.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'size-btn'; btn.innerText = s;
            const realSizeStock = (product.stockDetails && product.stockDetails[s] !== undefined) ? parseInt(product.stockDetails[s]) : 0;
            if (realSizeStock <= 0) {
                btn.classList.add('disabled'); btn.style.opacity = "0.4"; btn.style.pointerEvents = "none";
            } else {
                btn.onclick = () => {
                    sizeBox.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    selSize = s; maxStock = realSizeStock;
                    qtyIn.disabled = false; qtyIn.max = maxStock; qtyIn.value = 1;
                    stockWarn.innerText = `En stock`;
                    stockWarn.style.color = "#28a745"; stockWarn.classList.remove('hidden');
                };
            }
            sizeBox.appendChild(btn);
        });
    } else {
        sizeBox.innerHTML = '<div style="color:red; font-weight:bold;">Rupture de stock totale</div>';
    }

    const addBtn = document.getElementById('add-to-cart-btn');
    const newBtn = addBtn.cloneNode(true); addBtn.parentNode.replaceChild(newBtn, addBtn);
    newBtn.onclick = () => {
        if (!selSize) { stockWarn.innerText = "Veuillez choisir une taille."; stockWarn.style.color = "red"; stockWarn.classList.remove('hidden'); return; }
        addToCart(product, selSize, parseInt(qtyIn.value) || 1);
    };

    const gdtBtn = document.getElementById('trigger-gdt');
    if (gdtBtn) {
        const catClean = (product.category || "").toUpperCase();
        if (catClean.includes("ATTELLE") || catClean.includes("GENOUILLERE") || catClean.includes("ACCESSOIRE")) {
            gdtBtn.style.display = 'none';
        } else {
            gdtBtn.style.display = 'inline-block';
            gdtBtn.onclick = () => initGDT(product.brand);
        }
    }
    
    renderRelatedProducts(product.related_products ? product.related_products.split(',') : []);
    openPanel(modal);
    if(isMobileOrTablet()) {
        const modalContent = modal.querySelector('.modal-content');
        if(modalContent) modalContent.scrollTop = 0;
    }
}

function renderRelatedProducts(relatedIds) {
    const section = document.getElementById('related-products-section');
    const grid = document.getElementById('related-products-grid');

    if (!section || !grid) return;
    if (!relatedIds || relatedIds.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    grid.innerHTML = '';
    const relatedProducts = state.products.filter(p => relatedIds.includes(p.id) && p.stock > 0).slice(0, 4);
    if (relatedProducts.length === 0) {
        section.classList.add('hidden');
        return;
    } 
    
    section.classList.remove('hidden');
    relatedProducts.forEach(product => {
        const card = createProductCard(product); 
        const miniBtn = card.querySelector('.add-btn-mini');
        if(miniBtn) miniBtn.remove();
        grid.appendChild(card);
    });
}

/* --- NOUVEAU GDT (Logic GDT conservée à l'identique) --- */

const GDT_BRANDS = ['Nike','Jordan','Peak','361°','Puma','Under Armour','Adidas','Reebok','Timberland','Converse','Asics'];
const GDT_RANGES = { men:{min:35,max:50}, women:{min:34,max:45}, kids:{min:28,max:39} };
const GDT_ADJUST = {'Nike':0,'Jordan':0.2,'Peak':0,'361°':-0.1,'Puma':0.1,'Under Armour':0,'Adidas':0,'Reebok':0,'Timberland':0.3,'Converse':-0.2,'Asics':0};
const GDT_HEADERS = {
    'men': ['EU','US (M)','UK','Longueur pied'],
    'women': ['EU','US (W)','UK','Longueur pied'],
    'kids': ['EU','US (Y/C)','UK','Longueur pied']
};

function euToCm(eu){ return +(22.5 + 0.5*(eu - 35)).toFixed(1); }
function euToUsMen(eu){ return +(eu - 33).toFixed(1); }
function euToUsWomen(eu){ return +(eu - 31).toFixed(1); }
function euToUk(us){ return +(us - 1).toFixed(1); }

function buildGdtRows(brand, category){
  const rows=[]; 
  const r = GDT_RANGES[category];
  for(let eu=r.min; eu<=r.max; eu++){
    let cm = (category==='kids') ?
    +(12.25 + 0.5*(eu - 16) + (GDT_ADJUST[brand]||0)).toFixed(1) : +(euToCm(eu) + (GDT_ADJUST[brand]||0)).toFixed(1);
    
    let us, usText, uk, ukText, cmText;
    if(category==='women'){
      us = euToUsWomen(eu);
    } else {
      us = euToUsMen(eu);
    }
    
    usText = Number.isInteger(us)?us.toString():us.toFixed(1);
    uk = euToUk(us);
    ukText = Number.isInteger(uk)?uk.toString():uk.toFixed(1);
    if(brand==='Peak'){
      const mm = Math.round(cm*10);
      cmText = mm + ' mm';
    } else {
      cmText = cm.toFixed(1) + ' cm';
    }
    
    rows.push([eu.toString(), usText, ukText, cmText]);
  }
  return rows;
}

function buildGdtTable(category, rows){
  const headers = GDT_HEADERS[category];
  const wrap=document.createElement('div'); wrap.className='table-wrap';
  const table=document.createElement('table'); table.className='table';
  const thead=document.createElement('thead'); const thr=document.createElement('tr');
  headers.forEach(h=>{ const th=document.createElement('th'); th.textContent=h; thr.appendChild(th); }); thead.appendChild(thr); table.appendChild(thead);
  
  const tbody=document.createElement('tbody');
  rows.forEach(r=>{ 
      const tr=document.createElement('tr'); 
      tr.setAttribute('data-cat', category); 
      r.forEach((c, i)=>{ 
          const td=document.createElement('td'); 
          td.textContent=c; 
          td.setAttribute('data-label', headers[i]);
          tr.appendChild(td); 
      }); 
      tbody.appendChild(tr); 
  });
  table.appendChild(tbody); wrap.appendChild(table); return wrap;
}

function renderGdtBrand(brand){
  const main=document.getElementById('mainArea'); 
  if(!main) return;
  main.innerHTML='';
  
  const card=document.createElement('div'); card.className='card';
  const title=document.createElement('h2'); title.textContent=brand; card.appendChild(title);
  const mTitle=document.createElement('div'); mTitle.className='section-title'; mTitle.textContent='Homme (EU 35 → 50)'; mTitle.setAttribute('data-cat','men'); card.appendChild(mTitle);
  card.appendChild(buildGdtTable('men', buildGdtRows(brand,'men')));

  const wTitle=document.createElement('div'); wTitle.className='section-title'; wTitle.textContent='Femme (EU 34 → 45)';
  wTitle.setAttribute('data-cat','women'); card.appendChild(wTitle);
  card.appendChild(buildGdtTable('women', buildGdtRows(brand,'women')));

  const kTitle=document.createElement('div'); kTitle.className='section-title'; kTitle.textContent='Enfant (EU 28 → 39)'; kTitle.setAttribute('data-cat','kids'); card.appendChild(kTitle);
  card.appendChild(buildGdtTable('kids', buildGdtRows(brand,'kids')));

  main.appendChild(card);
  const bTitle = document.getElementById('brandTitle');
  if(bTitle) bTitle.textContent=brand;
  
  const note=document.getElementById('brandNote');
  if(note) {
      if(brand==='Converse') note.textContent='Converse a tendance à tailler petit — envisager +0.5 à 1.0 cm de marge.';
      else if(brand==='Timberland') note.textContent='Timberland peut tailler large — vérifie le guide modèle.';
      else note.textContent='Astuce : mesure ton pied en cm — choisis la taille dont la longueur est égale ou légèrement supérieure.';
  }
}

function initGDT(brandNameInput) {
    const modal = document.getElementById('modal-gdt'); 
    if(!modal) return;
    
    openPanel(modal);
    
    let currentBrand = 'Nike';
    if (brandNameInput) {
        const inputLower = brandNameInput.toLowerCase();
        const found = GDT_BRANDS.find(b => {
            const bLower = b.toLowerCase();
            return inputLower.includes(bLower) || bLower.includes(inputLower);
        });
        if (found) currentBrand = found;
        else if (inputLower.includes('jordan')) currentBrand = 'Jordan';
        else if (inputLower.includes('yeezy')) currentBrand = 'Adidas';
    }

    const controls = document.getElementById('controls');
    if (controls) {
        controls.innerHTML = '';
        GDT_BRANDS.forEach((b, i) => {
            const btn = document.createElement('button'); 
            btn.className = 'tab'; 
            btn.textContent = b;
            if (b === currentBrand) btn.classList.add('active');
            btn.addEventListener('click', () => { 
                document.querySelectorAll('#modal-gdt .tab').forEach(x=>x.classList.remove('active')); 
                btn.classList.add('active'); 
                renderGdtBrand(b); 
            });
            controls.appendChild(btn);
        });
    }
    renderGdtBrand(currentBrand);
}
/* =================================================================
   ⚡ KICKS FRONTEND V32.8 (PARTIE 2 : PANIER, CHECKOUT & COOKIES)
================================================================= */

/* --- GESTION PANIER & UPSELL DYNAMIQUE --- */

function loadCart() { 
    try { 
        const saved = localStorage.getItem('kicks_cart');
        if (saved) state.cart = JSON.parse(saved); 
        updateCartUI(); 
    } catch (e) { 
        state.cart = [];
    } 
}

function saveCart() { 
    localStorage.setItem('kicks_cart', JSON.stringify(state.cart));
}

function addToCart(product, size, qty) {
    // 1. GESTION DU CHARGEMENT DES COMMUNES (À LA DEMANDE)
    // On vérifie si les villes sont déjà chargées dans l'état global
    if (!state.allCities || state.allCities.length === 0) {
        console.log("📦 Premier ajout au panier détecté : Chargement du JSON des communes...");
        fetchAllCities(); 
    }

    // 2. TA LOGIQUE DE VÉRIFICATION DE LIMITE (EXISTANTE)
    const totalItems = state.cart.reduce((acc, item) => acc + item.qty, 0);
    if ((totalItems + qty) > CONFIG.MAX_QTY_PER_CART) { 
        alert(CONFIG.MESSAGES.STOCK_LIMIT); 
        return; 
    }
    
    // Récupération du stock réel selon la taille
    const limit = (product.stockDetails && product.stockDetails[size]) 
        ? parseInt(product.stockDetails[size]) 
        : product.stock;
        
    const existing = state.cart.find(i => i.id === product.id && i.size === size);
    const currentQty = existing ? existing.qty : 0;
    
    if ((currentQty + qty) > limit) { 
        alert(`Stock insuffisant. Il ne reste que ${limit} paires.`); 
        return; 
    }

    // --- CONSTRUCTION DE L'URL ABSOLUE (IMAGE) ---
    // CORRECTION : On utilise la clé "Lien URL" car "product.images" est undefined dans ton JSON
    let relativePath = product["Lien URL"] || 'assets/placeholder.jpg';
    let fullImageUrl = relativePath;

    // Si le chemin ne commence pas par http, on ajoute le domaine du site
    if (relativePath.indexOf('http') !== 0) {
        // Pour les mails, il est préférable d'utiliser le domaine en dur si window.location pose problème
        const baseUrl = window.location.origin;
        // Nettoyage des slashes pour éviter "https://kixx.fr//assets"
        fullImageUrl = baseUrl + (relativePath.startsWith('/') ? '' : '/') + relativePath;
    }

    if (existing) {
        existing.qty += qty;
    } else {
        state.cart.push({ 
            id: product.id, 
            model: product.model, 
            brand: product.brand, 
            price: product.price, 
            image: fullImageUrl, // L'URL complète et correcte est enregistrée ici
            size: size, 
            qty: qty, 
            stockMax: limit,
            // CORRECTION : On utilise bien la clé MAJUSCULE du JSON
            cartUpsellId: product.CART_UPSELL_ID || null, 
        });
    }

    saveCart(); 
    updateCartUI();
    closePanel(document.getElementById('product-modal')); 
    openPanel(document.getElementById('cart-drawer'));
}

function changeQty(index, delta) { 
    const item = state.cart[index]; 
    if (!item) return;
    const newQty = item.qty + delta; 
    if (delta > 0 && newQty > item.stockMax) { alert(`Stock max atteint (${item.stockMax}).`); return; } 
    if (newQty <= 0) { removeFromCart(index); return; } 
    item.qty = newQty;
    saveCart(); updateCartUI(); 
}

function removeFromCart(index) { 
    state.cart.splice(index, 1); 
    saveCart(); updateCartUI();
}

function updateCartUI() {
    const list = document.getElementById('cart-items'); 
    const badge = document.getElementById('cart-count'); 
    const totalEl = document.getElementById('cart-total-price');
    const qtyEl = document.getElementById('cart-qty');
    
    if (!list) return; 
    list.innerHTML = ""; 
    let total = 0; 
    let count = 0;
    state.cart.forEach((item) => { 
        total += item.price * item.qty; 
        count += item.qty; 
    });
    if (state.cart.length === 0) { 
        list.innerHTML = `<div style="text-align:center; padding:40px; color:#888;">${CONFIG.MESSAGES.EMPTY_CART}</div>`;
        if(badge) badge.classList.add('hidden'); 
    } 
    else {
        const remaining = CONFIG.FREE_SHIPPING_THRESHOLD - total;
        let progressHtml = remaining > 0 ? 
            `<div style="padding:10px; background:var(--bg-secondary); margin-bottom:15px; border-radius:4px; font-size:0.9rem; border:1px solid var(--border-color);">Plus que <b>${formatPrice(remaining)}</b> pour la livraison offerte !<div style="height:4px; background:#ddd; margin-top:5px; border-radius:2px;"><div style="width:${Math.min(100, ((CONFIG.FREE_SHIPPING_THRESHOLD - remaining) / CONFIG.FREE_SHIPPING_THRESHOLD) * 100)}%; height:100%; background:#00c853; border-radius:2px;"></div></div></div>` : 
            `<div style="padding:10px; background:#e8f5e9; color:#2e7d32; margin-bottom:15px; border-radius:4px; font-weight:bold; text-align:center;">🎉 Livraison OFFERTE !</div>`;
        list.insertAdjacentHTML('beforeend', progressHtml);

        state.cart.forEach((item, idx) => { 
            const div = document.createElement('div'); 
            div.className = 'cart-item'; 
            div.innerHTML = `<img src="${item.image}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; background:#f4f4f4;"><div style="flex:1;"><div style="font-weight:600; font-size:0.9rem;">${item.brand} ${item.model}</div><div style="font-size:0.8rem; color:#666;">Taille: ${item.size}</div><div style="font-weight:700; margin-top:4px;">${formatPrice(item.price)}</div><div class="qty-control" style="display:flex; align-items:center; gap:10px; margin-top:5px;"><button onclick="changeQty(${idx}, -1)" class="qty-btn">-</button><span>${item.qty}</span><button onclick="changeQty(${idx}, 1)" class="qty-btn">+</button><button onclick="removeFromCart(${idx})" class="remove-btn">Retirer</button></div></div>`; 
            list.appendChild(div); 
        });

        const triggerItem = state.cart.find(item => item.cartUpsellId && item.cartUpsellId.length > 1);
        const targetUpsellId = triggerItem ? triggerItem.cartUpsellId : CONFIG.UPSELL_ID;
        const accessory = state.products.find(p => p.id === targetUpsellId);
        const isAccessoryInCart = state.cart.some(item => item.id === targetUpsellId);
        if (accessory && !isAccessoryInCart && accessory.stock > 0) {
            const sizeRecommendation = triggerItem ? triggerItem.size : (accessory.sizesList[0] || 'TU');
            const phraseAccroche = triggerItem ? `Complétez votre commande de ${triggerItem.model} !` : "Ne manquez pas cet accessoire !";
            const upsellHtml = `
                <div style="background:#fff8e1; border:1px solid #ffc107; padding:15px; border-radius:6px; margin-top:15px; display:flex; gap:10px; align-items:center;">
                    <img src="${accessory.images[0] || 'assets/placeholder.jpg'}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">
                    <div style="flex:1;">
                        <p style="margin:0; font-weight:bold; font-size:0.9rem; color:#111;">${phraseAccroche}</p>
                        <p style="margin:2px 0 8px; font-size:0.8rem;">Ajouter <strong>${accessory.model}</strong> (${sizeRecommendation}) pour ${formatPrice(accessory.price)}</p>
                        <button id="add-upsell-btn" data-id="${accessory.id}" data-size="${sizeRecommendation}" style="background:#ffc107; color:#111; border:none; padding:5px 10px; border-radius:4px; font-weight:bold; font-size:0.75rem; cursor:pointer;">Ajouter au Panier</button>
                    </div>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', upsellHtml);
            
            setTimeout(() => {
                const upsellBtn = document.getElementById('add-upsell-btn');
                if (upsellBtn) {
                    upsellBtn.addEventListener('click', () => {
                        const recSize = upsellBtn.getAttribute('data-size');
                        const recId = upsellBtn.getAttribute('data-id');
                        const productToAdd = state.products.find(p => p.id === recId);
                        if(productToAdd) addToCart(productToAdd, recSize, 1);
                    });
                }
            }, 0);
        }

        if(badge) { badge.innerText = count; badge.classList.remove('hidden'); }
    }
    
    if(totalEl) totalEl.innerText = formatPrice(total); 
    if(qtyEl) qtyEl.innerText = count;
}

/* --- RECHERCHE --- */
function initSearch() {
    const input = document.getElementById('search-input'); 
    const resultsBox = document.getElementById('search-results');
    const searchBtn = document.getElementById('search-btn');
    
    if (!input || !resultsBox || !searchBtn) return;
    if (isMobileOrTablet()) {
        resultsBox.classList.add('hidden');
    }

    input.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim(); 
        if (q.length < 2) { 
            resultsBox.classList.add('hidden'); 
            return; 
        }
        const hits = state.products.filter(p => (p.model && p.model.toLowerCase().includes(q)) || (p.brand && p.brand.toLowerCase().includes(q))).slice(0, 5);
        resultsBox.innerHTML = '';
    
        if (hits.length === 0) resultsBox.innerHTML = '<div class="search-result-item">Aucun résultat</div>';
        else { 
            hits.forEach(p => { 
                const item = document.createElement('div'); 
                item.className = 'search-result-item'; 
                const img = (p.images && p.images[0]) ? p.images[0] : ''; 
                item.innerHTML = `<img src="${img}"><div><span style="font-weight:bold">${p.model}</span><br><small>${formatPrice(p.price)}</small></div>`; 
                item.addEventListener('click', () => { 
                    openProductModal(p);
                    resultsBox.classList.add('hidden'); 
                    input.value = ''; 
                }); 
                resultsBox.appendChild(item); 
            }); 
        }
        resultsBox.classList.remove('hidden');
    });
    document.addEventListener('click', (e) => { 
        if (!input.contains(e.target) && !resultsBox.contains(e.target) && !searchBtn.contains(e.target)) {
            resultsBox.classList.add('hidden'); 
        }
    });
}

function updateThemeIcons(isDark) { 
    const sun = document.querySelector('.icon-sun'); 
    const moon = document.querySelector('.icon-moon');
    if (sun && moon) { 
        sun.classList.toggle('hidden', isDark); 
        moon.classList.toggle('hidden', !isDark);
        moon.style.color = isDark ? "#ffffff" : "inherit"; 
    } 
}

/* --- LOGIQUE MOBILE & OFF-CANVAS --- */
function setupMobileFilters() {
    const isMobile = isMobileOrTablet();
    const filterBar = document.getElementById('filters-bar');
    const mobileContent = document.getElementById('mobile-filters-content');
    const mobileTrigger = document.getElementById('mobile-menu-trigger');
    const filterDrawer = document.getElementById('mobile-filter-drawer');
    const applyBtn = document.getElementById('apply-filters-btn');
    const searchContainer = document.querySelector('.search-container');
    const headerContainer = document.querySelector('.header-container'); 

    if (!mobileContent || !searchContainer || !headerContainer) return;
    if (isMobile) {
        if (!mobileContent.contains(searchContainer)) {
            const searchWrapper = document.createElement('div');
            searchWrapper.id = 'mobile-search-wrapper';
            searchWrapper.style.cssText = 'padding: 10px 0; border-bottom: 1px solid var(--border-color); margin-bottom: 15px;';
            searchWrapper.appendChild(searchContainer);
            
            mobileContent.prepend(searchWrapper);
            searchContainer.style.display = 'block';
        }

        if (filterBar.children.length > 0) {
            const fragment = document.createDocumentFragment();
            while (filterBar.firstChild) {
                fragment.appendChild(filterBar.firstChild);
            }
            mobileContent.innerHTML = ''; 
            mobileContent.appendChild(searchContainer.parentElement);
            mobileContent.appendChild(fragment); 
            filterBar.style.display = 'none';
        }

        if (mobileTrigger) {
            mobileTrigger.classList.remove('hidden');
            mobileTrigger.addEventListener('click', () => {
                openPanel(filterDrawer);
            });
        }
        
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                closePanel(filterDrawer);
                renderCatalog(true); 
            });
        }

    } else { 
        if (!headerContainer.contains(searchContainer)) {
            const headerActions = document.querySelector('.header-actions');
            if (headerActions && searchContainer.parentElement.id === 'mobile-search-wrapper') {
                headerContainer.insertBefore(searchContainer, headerActions);
                const mobileWrapper = document.getElementById('mobile-search-wrapper');
                if(mobileWrapper) mobileWrapper.remove();
                searchContainer.style.display = ''; 
            }
        }
        if (filterBar) filterBar.style.display = 'flex';
        const mobileTrigger = document.getElementById('mobile-menu-trigger');
        if (mobileTrigger) mobileTrigger.classList.add('hidden');
    }
}

/* --- ÉCOUTEURS GLOBAUX & AVIS CLIENT (MODIFIÉ) --- */
function setupGlobalListeners() {
    // Panier
    const cartTrig = document.getElementById('cart-trigger');
    if (cartTrig) cartTrig.addEventListener('click', () => openPanel(document.getElementById('cart-drawer')));

    // Fermeture
    document.addEventListener('click', (e) => {
        const el = e.target;
        if (el.classList.contains('close-drawer') || el.classList.contains('drawer-overlay') || el.classList.contains('close-modal') || el.classList.contains('modal-overlay')) {
            const parent = el.closest('.modal') || el.closest('.drawer');
            if(parent) {
                closePanel(parent);
                if (parent.id === 'product-modal') {
                    document.title = "KICKS | Sneakers Exclusives";
                    const metaDesc = document.getElementById('meta-description');
                    if (metaDesc) metaDesc.setAttribute('content', "KICKS - La référence sneakers exclusives. Livraison 48H authenticité garantie.");
                }
            }
        }
    });

    // Modales Footer (MODIFIÉ POUR AVIS CLIENT)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-modal]');
        if (btn) { 
            const modalId = btn.getAttribute('data-modal');
            const targetModal = document.getElementById(modalId); 
            
            if(targetModal) {
                // Modification : Chargement site AVC Kicks dans la modale
                if (modalId === 'modal-avis') {
                    const contentBox = targetModal.querySelector('.modal-content');
                    if (contentBox) {
                        contentBox.innerHTML = `
                            <button class="close-modal" style="position:absolute; top:10px; right:10px; z-index:99; background:white; border-radius:50%; width:30px; height:30px; border:1px solid #ddd; cursor:pointer; font-weight:bold; color:black;">✕</button>
                            <iframe src="https://avc.kixx.fr" style="width:100%; height:100%; min-height:80vh; border:none; display:block;" allow="autoplay"></iframe>
                        `;
                        contentBox.style.padding = "0";
                        contentBox.style.overflow = "hidden";
                    }
                }
                
                openPanel(targetModal);
                if(isMobileOrTablet()) {
                    const content = targetModal.querySelector('.modal-content');
                    if(content) content.scrollTop = 0;
                }
            }
        }
    });

    // Dark Mode
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('kicks_theme', isDark ? 'dark' : 'light');
            updateThemeIcons(isDark);
        });
    }

    // Checkout Trigger
    const checkoutBtn = document.getElementById('checkout-trigger-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (state.cart.length === 0) { alert(CONFIG.MESSAGES.EMPTY_CART); return; }
            closePanel(document.getElementById('cart-drawer'));
            initCheckoutUI(); 
            openPanel(document.getElementById('modal-checkout')); 
            setTimeout(renderRecaptchaV2, 500); 
            const checkoutModal = document.getElementById('modal-checkout');
            if (isMobileOrTablet() && checkoutModal) {
                checkoutModal.querySelector('.modal-content').scrollTop = 0;
            }
        });
    }
}

/* --- CHECKOUT UI & LOGIQUE --- */

function initCheckoutUI() {
    const btnVirement = document.getElementById('btn-pay-virement');
    if (btnVirement) {
        btnVirement.removeEventListener('click', initiateBankTransferWrapper);
        btnVirement.addEventListener('click', initiateBankTransferWrapper);
    }
    
    state.currentPaymentMethod = "CARD";
    state.appliedPromoCode = null;
    state.promoDiscountAmount = 0;
    const paysSelect = document.getElementById('ck-pays');
    if (paysSelect) {
        paysSelect.addEventListener('change', () => updateShippingOptions(paysSelect.value));
    }

    const villeInput = document.getElementById('ck-ville');
    const cpInput = document.getElementById('ck-cp');

    if (villeInput) villeInput.addEventListener('input', updateExpressShipping);
    if (cpInput) cpInput.addEventListener('input', updateExpressShipping);
    const methodBtns = document.querySelectorAll('.pay-btn-select');
    methodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            methodBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.currentPaymentMethod = btn.getAttribute('data-method');
            initPaymentButtonsArea(); updateCheckoutTotal();
        });
    });
    const promoBtn = document.getElementById('apply-promo-btn');
    if(promoBtn) promoBtn.addEventListener('click', applyPromoCode);

    initPaymentButtonsArea();
    updateCheckoutTotal();
    initAutocomplete();
    initFormNavigation();
}

function initiateBankTransferWrapper() {
    const customer = getFormData();
    if (customer) {
        if (!state.currentShippingRate) { 
            alert("Veuillez choisir la livraison.");
            return; 
        }
        initiateBankTransfer(customer);
    } 
}

function initFormNavigation() {
    const form = document.getElementById('checkout-form');
    if (!form) return;
    
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach((input, index) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const nextInput = inputs[index + 1];
                if (nextInput) {
                    nextInput.focus();
                } else {
                    document.querySelector('.checkout-summary-col').scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });
}

function initAutocomplete() {
    const cpInput = document.getElementById('ck-cp');
    const villeInput = document.getElementById('ck-ville');
    if (!cpInput || !villeInput) return;

    let suggestionsBox = document.getElementById('cp-suggestions');
    if (!suggestionsBox) return;

    suggestionsBox.style.display = 'none';

    cpInput.addEventListener('input', (e) => {
        const cpVal = e.target.value.trim(); 
        
        if (cpVal.length < 2 || !state.allCities || state.allCities.length === 0) { 
             suggestionsBox.style.display = 'none'; 
             if (typeof updateExpressShipping === 'function') updateExpressShipping(); 
             return; 
        }

        const matches = state.allCities.filter(c => {
            const code = String(c.cp || "").trim();
            return code.startsWith(cpVal);
        }).slice(0, 8);

        suggestionsBox.innerHTML = '';

        if (matches.length > 0) {
            suggestionsBox.style.display = 'block';
            matches.forEach(c => {
                const li = document.createElement('li'); 
                li.innerText = `${c.cp} - ${c.ville}`;
                li.style.cursor = 'pointer';
                
                li.onclick = (event) => { 
                    event.preventDefault();
                    cpInput.value = c.cp; 
                    villeInput.value = c.ville; 
                    suggestionsBox.style.display = 'none'; 
                    
                    // On déclenche les events pour le calcul des frais et le backend
                    cpInput.dispatchEvent(new Event('input', { bubbles: true })); 
                    villeInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    if (typeof updateExpressShipping === 'function') updateExpressShipping();
                };
                suggestionsBox.appendChild(li);
            });
        } else {
            suggestionsBox.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => { 
        if (e.target !== cpInput && !suggestionsBox.contains(e.target)) {
            suggestionsBox.style.display = 'none'; 
        }
    });
}

    // Fermeture de la boîte si on clique à l'extérieur
document.addEventListener('click', (e) => { 
    // On récupère les éléments en temps réel
    const inputCP = document.getElementById('checkout-cp'); // Vérifie que l'ID est bien celui de ton champ CP
    const sBox = document.getElementById('suggestions-cp'); // Vérifie que l'ID est bien celui de ta liste

    if (inputCP && sBox) {
        if (e.target !== inputCP && !sBox.contains(e.target)) {
            sBox.style.display = 'none'; 
        }
    }
});
	
/* --- LIVRAISON DYNAMIQUE --- */

function updateExpressShipping() {
    const paysSelect = document.getElementById('ck-pays');
    const selectedZone = paysSelect ? paysSelect.value : null;
    
    if(selectedZone) {
         updateShippingOptions(selectedZone);
    } else {
        const container = document.getElementById('shipping-options-container');
        if (container) container.innerHTML = '<div style="color:#666; font-style:italic; padding:10px;">Veuillez choisir votre pays de livraison.</div>';
        state.currentShippingRate = null;
        updateCheckoutTotal();
    }
}

function updateShippingOptions(selectedZone) {
    const container = document.getElementById('shipping-options-container');
    if (!container) return;
    container.innerHTML = '';

    const villeInput = document.getElementById('ck-ville');
    const cpInput = document.getElementById('ck-cp');
    
    if (!villeInput || !cpInput || villeInput.value.trim().length < 3) {
        container.innerHTML = '<div style="color:#666; font-style:italic; padding:10px;">Veuillez compléter votre adresse (CP et Ville) pour voir les tarifs.</div>';
        state.currentShippingRate = null;
        updateCheckoutTotal();
        return;
    }

    const cartSubtotal = state.cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const userCityRaw = villeInput.value;
    const userCityNorm = normalizeString(userCityRaw);

    let validRates = state.shippingRates.filter(rate => {
        if (rate.code !== selectedZone) return false;
        if (String(rate.name).toLowerCase().includes('express') || rate.isSensitive) return false;

        const min = parseFloat(rate.min || 0);
        const max = parseFloat(rate.max || 999999);
        const isFreeShippingRate = parseFloat(rate.price) === 0;
        
        if (cartSubtotal >= CONFIG.FREE_SHIPPING_THRESHOLD && isFreeShippingRate) return true;
        if (!isFreeShippingRate) return cartSubtotal >= min && cartSubtotal <= max;
        return false;
    });
    if (selectedZone === 'Guadeloupe' || selectedZone === 'Martinique' || selectedZone === 'Guyane') {
        const isEligible = state.expressZones.some(zoneKeyword => userCityNorm.includes(zoneKeyword));
        if (isEligible) {
            const expressRate = state.shippingRates.find(r => 
                r.code === selectedZone && 
                (String(r.name).toLowerCase().includes('express') || r.isSensitive)
            );
            if (expressRate) {
                const min = parseFloat(expressRate.min || 0);
                const max = parseFloat(expressRate.max || 999999);
                if (cartSubtotal >= min && cartSubtotal <= max) {
                    validRates.push(expressRate);
                }
            }
        }
    }

    if (validRates.length === 0) {
        container.innerHTML = '<div style="color:red; padding:10px;">Aucune livraison disponible pour cette zone/montant.</div>';
        state.currentShippingRate = null;
    } else {
        validRates.sort((a, b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));
        validRates.forEach((rate, idx) => {
            const label = document.createElement('label');
            const logoHtml = rate.logo ? `<img src="${rate.logo}" style="height:25px; margin-right:10px; object-fit:contain;">` : '';
            const price = parseFloat(rate.price || 0);
            const priceTxt = price === 0 ? "OFFERT" : formatPrice(price);
            const color = price === 0 ? "#00c853" : "#000";
            
            const isExpress = String(rate.name).toLowerCase().includes('express') || rate.isSensitive;
            const bgStyle = isExpress ? "background:#fff8e1; border:1px solid #ffc107;" : "";
            
            const isSelected = (!state.currentShippingRate && idx === 0) || (state.currentShippingRate && state.currentShippingRate.name === rate.name && state.currentShippingRate.code === rate.code);

            label.innerHTML = `
                <div class="shipping-option" style="display:flex; align-items:center; width:100%; cursor:pointer; padding:10px; border-radius:6px; ${bgStyle}">
                    <input type="radio" name="shipping_method" value="${idx}" ${isSelected?'checked':''} style="margin-right:15px;">
                    ${logoHtml}
                    <div style="flex:1;">
                        <span style="font-weight:700;">${rate.name}</span>
                        ${isExpress ? '<br><small style="color:#d32f2f; font-weight:bold;">🚀 Livraison Rapide 24h</small>' : ''}
                    </div>
                    <b style="color:${color}">${priceTxt}</b>
                </div>
            `;
            
            label.querySelector('input').addEventListener('change', () => { 
                state.currentShippingRate = rate; 
                updateCheckoutTotal(); 
            });
            container.appendChild(label);
            
            if(isSelected || (!state.currentShippingRate && idx === 0)) state.currentShippingRate = rate;
        });
    }
    updateCheckoutTotal();
}

function updateCheckoutTotal() {
    const subTotal = state.cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const shipping = state.currentShippingRate ? parseFloat(state.currentShippingRate.price) : 0;
    const discount = state.appliedPromoCode ? state.promoDiscountAmount : 0;
    const baseTotal = Math.max(0, subTotal + shipping - discount);
    
    const feeConfig = CONFIG.FEES[state.currentPaymentMethod] || CONFIG.FEES.CARD;
    let fees = 0;
    
    if (state.currentPaymentMethod !== 'CARD' && state.currentPaymentMethod !== 'VIREMENT') {
        fees = (baseTotal * feeConfig.percent) + feeConfig.fixed;
    }
    
    fees = Math.max(0, fees);
    const grandTotal = baseTotal + fees;
    const setText = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
    setText('checkout-subtotal', formatPrice(subTotal));
    setText('checkout-shipping', state.currentShippingRate ? (shipping===0?"Offert":formatPrice(shipping)) : "...");
    
    const discRow = document.getElementById('discount-row');
    if (discRow) {
        if(discount > 0) { discRow.classList.remove('hidden'); setText('checkout-discount', "- " + formatPrice(discount));
        }
        else discRow.classList.add('hidden');
    }

    const feesRow = document.getElementById('fees-row');
    const feesEl = document.getElementById('checkout-fees');
    if (feesRow && feesEl) {
        if (fees > 0) { 
            feesRow.style.display = 'flex';
            feesRow.classList.remove('hidden');
            feesEl.innerText = "+ " + formatPrice(fees);
        }
        else {
            feesRow.style.display = 'none';
            feesRow.classList.add('hidden');
        }
    }

    setText('checkout-total', formatPrice(grandTotal));
    
    const payLabel = document.getElementById('btn-pay-label');
    if (payLabel) {
        if (state.currentPaymentMethod === 'KLARNA') payLabel.innerText = `🌸 Payer ${formatPrice(grandTotal)}`;
        else if (state.currentPaymentMethod === 'CARD') payLabel.innerText = `💳 Payer par Carte`;
    }
}

/* --- PAIEMENTS & HELPERS --- */

function initPaymentButtonsArea() {
    let btnVirement = document.getElementById('btn-pay-virement');
    const payActions = document.querySelector('.payment-actions');
    if (!btnVirement && payActions) {
        btnVirement = document.createElement('button');
        btnVirement.id = 'btn-pay-virement';
        btnVirement.className = 'btn-primary full-width hidden';
        btnVirement.innerText = "💶 Confirmer le Virement";
        payActions.appendChild(btnVirement);
    }
    btnVirement = document.getElementById('btn-pay-virement');
    const stripeBtn = document.getElementById('btn-pay-stripe');
    const paypalDiv = document.getElementById('paypal-button-container');
    const method = state.currentPaymentMethod;
    if(stripeBtn) {
        stripeBtn.classList.add('hidden');
        const newBtn = stripeBtn.cloneNode(true);
        stripeBtn.parentNode.replaceChild(newBtn, stripeBtn);
        newBtn.addEventListener('click', handleStripePayment);
    }
    
    if(paypalDiv) paypalDiv.classList.add('hidden');
    if(btnVirement) btnVirement.classList.add('hidden');
    if (method === 'VIREMENT') {
        if(btnVirement) btnVirement.classList.remove('hidden');
    } else if (method === 'PAYPAL_4X') {
        if(paypalDiv) { paypalDiv.classList.remove('hidden'); initPayPalButtons();
        }
    } else { // CARD / KLARNA
        const sBtn = document.getElementById('btn-pay-stripe');
        if(sBtn) sBtn.classList.remove('hidden');
    }
}

// A. VIREMENT
function initiateBankTransfer(customer) {
    const btn = document.getElementById('btn-pay-virement');
    
    // 1. On définit comment traiter la commande
    const processOrder = (recaptchaToken) => {
        if (!recaptchaToken) { 
            alert(CONFIG.MESSAGES.ERROR_RECAPTCHA); 
            if (btn) { btn.disabled = false; btn.innerText = "💶 Confirmer le Virement"; }
            return; 
        }

        const subTotal = state.cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
        const shippingCost = state.currentShippingRate ? parseFloat(state.currentShippingRate.price) : 0;
        const discount = state.appliedPromoCode ? state.promoDiscountAmount : 0;
        const total = Math.max(0, subTotal + shippingCost - discount);

        const payload = { 
            action: 'recordManualOrder', 
            source: 'VIREMENT', 
            recaptchaToken: recaptchaToken, 
            cart: state.cart, 
            total: total.toFixed(2), 
            client: customer, 
            promoCode: state.appliedPromoCode,
            shippingRate: state.currentShippingRate 
        };

        if (btn) { btn.disabled = true; btn.innerText = "Traitement..."; }

        fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) })
            .then(res => res.json())
            .then(res => {
                if(res.error) throw new Error(res.error);
                closePanel(document.getElementById('modal-checkout'));
                localStorage.removeItem('kicks_cart');
                state.cart = []; updateCartUI();
                
                const rib = res.rib || {};
                const ribHtml = `
                    <div style="text-align:left; background:var(--bg-secondary); color:var(--text-primary); padding:20px; border-radius:8px; margin-top:20px; font-size:0.9rem;">
                        <h3>Détails du Virement</h3>
                        <p>Montant : <strong>${formatPrice(total)}</strong></p>
                        <p>Référence : <strong>${res.orderId || res.id}</strong></p>
                        <hr style="border:0; border-top:1px solid #ccc; margin:10px 0;">
                        <p><strong>IBAN :</strong> ${rib.iban || 'N/A'}</p>
                        <p><strong>BIC :</strong> ${rib.bic || 'N/A'}</p>
                        <p><strong>TITULAIRE :</strong> ${rib.titulaire || 'N/A'}</p>
                        <p><strong>BANQUE :</strong> ${rib.banque || 'N/A'}</p>
                        <p><strong>ADRESSE :</strong> ${rib.adresse || 'N/A'}</p>
                    </div>`;
                
                showSuccessScreen(customer.prenom, `Commande enregistrée. Veuillez effectuer le virement.` + ribHtml);
            })
            .catch(e => { 
                alert("Erreur: " + e.message); 
                if (btn) { btn.disabled = false; btn.innerText = "💶 Confirmer le Virement"; }
            });
    };

    // 2. Lancement de la sécurité RECAPTCHA
    if (btn) { btn.disabled = true; btn.innerText = "Vérification..."; }

    try {
        grecaptcha.ready(() => {
            grecaptcha.execute(CONFIG.RECAPTCHA_SITE_KEY, {action: 'submit'}).then(token => {
                processOrder(token);
            });
        });
    } catch (e) {
        console.error("Erreur Recaptcha:", e);
        if (btn) { btn.disabled = false; btn.innerText = "💶 Confirmer le Virement"; }
    }
} // <--- C'EST CETTE ACCOLADE QUI FERME TOUT. ELLE DOIT ÊTRE ICI.
	
// B. STRIPE
async function handleStripePayment() {
    const recaptchaToken = getRecaptchaResponse();
    if (!recaptchaToken) { alert(CONFIG.MESSAGES.ERROR_RECAPTCHA); return; }
    const customer = getFormData(); if (!customer) return;
    if (!state.currentShippingRate) { alert("Choisissez une livraison."); return; }

    const btn = document.getElementById('btn-pay-stripe'); btn.disabled = true;
    const payload = {
        action: 'createCheckoutSession', 
        recaptchaToken: recaptchaToken, 
        cart: state.cart,
        customerDetails: customer, 
        customerEmail: customer.email, 
        shippingRate: state.currentShippingRate,
        promoCode: state.appliedPromoCode,
        successUrl: window.location.origin + window.location.pathname + "?payment=success",
        cancelUrl: window.location.origin + window.location.pathname
    };
    if (state.currentPaymentMethod === 'KLARNA') {
        payload.paymentMethod = 'KLARNA';
    } else {
        payload.paymentMethod = 'CARD';
    }

    try {
        const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
        const json = await res.json();
        if (json.url) window.location.href = json.url;
        else throw new Error(json.error || "Erreur Session Stripe/Klarna");
    } catch (e) {
        alert(e.message); btn.disabled = false;
        if(window.grecaptcha) grecaptcha.reset();
    }
}

// C. PAYPAL
function initPayPalButtons() {
    const container = document.getElementById('paypal-button-container'); 
    if (!container) return;
    
    // 1. Nettoyage physique du container
    container.innerHTML = "";

    // 2. Vérification SDK
    if (!window.paypal || !window.paypal.Buttons) {
        console.warn("PayPal SDK non chargé ou incomplet.");
        container.innerHTML = "<div style='color:red;font-size:12px;'>Erreur chargement PayPal. Recharger la page.</div>";
        return;
    }
    
    try {
        // 3. Création et Rendu du Bouton
        // On stocke l'instance pour éviter les conflits
        const paypalButtons = window.paypal.Buttons({
            style: { 
                layout: 'vertical', 
                color: 'gold', 
                shape: 'rect', 
                label: 'paypal' 
            },

            // Validation au clic
            onClick: function(data, actions) {
                // Vérif Formulaire (Priorité pour éviter de lancer ReCaptcha si le form est vide)
                const customer = getFormData();
                if (!customer || !state.currentShippingRate) { 
                    alert(CONFIG.MESSAGES.ERROR_FORM + " / Choix de livraison manquant."); 
                    return actions.reject(); 
                }

                // Vérif ReCaptcha
                const token = getRecaptchaResponse();
                if (!token) { 
                    alert(CONFIG.MESSAGES.ERROR_RECAPTCHA); 
                    // Optionnel : on pourrait forcer un grecaptcha.execute() ici si besoin
                    return actions.reject(); 
                }
                
                return actions.resolve();
            },

            // Création de la transaction
            createOrder: function(data, actions) {
                const sub = state.cart.reduce((acc, i) => acc + i.price * i.qty, 0);
                const ship = state.currentShippingRate ? parseFloat(state.currentShippingRate.price) : 0;
                const base = Math.max(0, sub + ship - state.promoDiscountAmount);
                
                // Calcul des frais selon tes termes CONFIG
                const fees = (base * CONFIG.FEES.PAYPAL_4X.percent) + CONFIG.FEES.PAYPAL_4X.fixed;
                const totalVal = (base + fees).toFixed(2);

                return actions.order.create({ 
                    purchase_units: [{ 
                        amount: { 
                            currency_code: 'EUR', // Précision importante pour le backend
                            value: totalVal 
                        } 
                    }] 
                });
            },

            // Capture du paiement
            onApprove: function(data, actions) {
                return actions.order.capture().then(function(details) {
                    console.log("Paiement PayPal Validé :", details);
                    
                    const customer = getFormData();
                    const token = getRecaptchaResponse();
                    const totalWithFees = details.purchase_units[0].amount.value;

                    const payload = { 
                        action: 'recordManualOrder', 
                        source: 'PAYPAL',
                        recaptchaToken: token, 
                        paymentId: details.id, 
                        total: totalWithFees,
                        cart: state.cart, 
                        client: customer, 
                        promoCode: state.appliedPromoCode,
                        shippingRate: state.currentShippingRate 
                    };
                    
                    // Envoi au Backend (Apps Script)
                    fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) })
                    .then(res => res.json())
                    .then(res => {
                        if (res.error) {
                            alert("Erreur Backend : " + res.error);
                        } else {
                            // Nettoyage panier et redirection
                            localStorage.removeItem('kicks_cart');
                            state.cart = [];
                            window.location.href = "?payment=success"; 
                        }
                    })
                    .catch(e => alert("Erreur Réseau : " + e.message));
                });
            },

            onError: function (err) {
                console.error("Erreur PayPal Button:", err);
                // On ne mentionne plus "Sandbox" pour ne pas effrayer le client en live
                alert("Une erreur technique est survenue avec PayPal. Veuillez réessayer.");
            }
        });

        // 4. Affichage final avec vérification d'éligibilité
        if (paypalButtons.isEligible()) {
            paypalButtons.render('#paypal-button-container');
        } else {
            container.innerHTML = "PayPal n'est pas disponible pour cette configuration.";
        }

    } catch (e) {
        console.error("Erreur Init PayPal:", e);
    }
}

/* --- HELPERS --- */

async function applyPromoCode() {
    const recaptchaToken = getRecaptchaResponse();
    if (!recaptchaToken) { alert(CONFIG.MESSAGES.ERROR_RECAPTCHA); return; }
    const input = document.getElementById('promo-code-input');
    const msg = document.getElementById('promo-message');
    const code = input.value.trim().toUpperCase(); if (!code) return;
    
    msg.innerText = "Vérification...";
    try {
        const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'checkPromo', code: code, recaptchaToken: recaptchaToken }) });
        const data = await res.json();
        
        if (data.valid) {
            state.appliedPromoCode = code;
            state.promoDiscountAmount = state.cart.reduce((acc, i) => acc + i.price * i.qty, 0) * data.discountPercent;
            msg.innerText = `Code appliqué : -${(data.discountPercent*100).toFixed(0)}% !`;
            msg.style.color = "green";
            updateCheckoutTotal();
        } else {
            msg.innerText = "Code invalide.";
            msg.style.color = "red";
            state.appliedPromoCode = null; state.promoDiscountAmount = 0; updateCheckoutTotal();
        }
        if(window.grecaptcha) grecaptcha.reset();
    } catch (e) { msg.innerText = "Erreur."; }
}

function getFormData() {
    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const pays = document.getElementById('ck-pays');
    const requiredFields = { email: 'ck-email', prenom: 'ck-prenom', nom: 'ck-nom', tel: 'ck-tel', adresse: 'ck-adresse', cp: 'ck-cp', ville: 'ck-ville' };
    for (let key in requiredFields) {
        const value = val(requiredFields[key]);
        if (!value) { 
            alert(`Veuillez remplir le champ : ${key.toUpperCase()}.`);
            return null; 
        }
    }
    
    if (!pays || !pays.value) { 
        alert("Veuillez choisir le pays de livraison.");
        return null; 
    }
    
    return { 
        email: val('ck-email'), prenom: val('ck-prenom'), nom: val('ck-nom'), tel: val('ck-tel'), 
        adresse: val('ck-adresse'), cp: val('ck-cp'), ville: val('ck-ville'), 
        pays: pays.value 
    };
}

/* =================================================================
   🍪 GESTIONNAIRE RGPD / COOKIES
================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    initCookieConsent();
});

function initCookieConsent() {
    const modal = document.getElementById('cookie-consent-modal');
    if (!modal) return;
    // Vérifier si le choix a déjà été fait
    const consent = localStorage.getItem('kicks_cookie_consent');
    // Si pas de choix, on affiche la modale (après un petit délai pour le splash screen)
    if (!consent) {
        setTimeout(() => {
            modal.classList.remove('hidden');
        }, 2500);
        // 2.5s pour laisser le temps au splash screen de finir si besoin
    } else {
        // Si consentement déjà donné, on active les scripts autorisés
        const choices = JSON.parse(consent);
        if (choices.analytics) activateScript('analytics');
    }

    // Boutons
    const btnAccept = document.getElementById('cookie-accept-btn');
    const btnReject = document.getElementById('cookie-reject-btn');
    const btnSettings = document.getElementById('cookie-settings-btn');
    const btnSave = document.getElementById('cookie-save-btn');
    const detailsDiv = document.getElementById('cookie-details');

    // 1. TOUT ACCEPTER
    if(btnAccept) btnAccept.addEventListener('click', () => {
        saveConsent({ necessary: true, analytics: true });
        activateScript('analytics');
        modal.classList.add('hidden');
    });

    // 2. TOUT REFUSER (Sauf essentiels)
    if(btnReject) btnReject.addEventListener('click', () => {
        saveConsent({ necessary: true, analytics: false });
        modal.classList.add('hidden');
    });

    // 3. PERSONNALISER
    if(btnSettings) btnSettings.addEventListener('click', () => {
        detailsDiv.classList.remove('hidden');
        btnSettings.classList.add('hidden');
        document.querySelector('.main-cookie-btns').classList.add('hidden');
        btnSave.classList.remove('hidden');
    });

    // 4. SAUVEGARDER CHOIX
    if(btnSave) btnSave.addEventListener('click', () => {
        const analyticsChecked = document.getElementById('cookie-analytics').checked;
        saveConsent({ necessary: true, analytics: analyticsChecked });
        if (analyticsChecked) activateScript('analytics');
        modal.classList.add('hidden');
    });
}

function saveConsent(preferences) {
    localStorage.setItem('kicks_cookie_consent', JSON.stringify(preferences));
    localStorage.setItem('kicks_consent_date', new Date().toISOString());
}

// Fonction magique qui transforme le text/plain en javascript exécutable
function activateScript(category) {
    const scripts = document.querySelectorAll(`script[data-cookiecategory="${category}"]`);
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        newScript.text = oldScript.innerText;
        
        // Copier les attributs (src, async, etc.)
        Array.from(oldScript.attributes).forEach(attr => {
            if (attr.name !== 'type' && attr.name !== 'data-cookiecategory') {
                newScript.setAttribute(attr.name, attr.value);
            }
        });
        
        newScript.type = 'text/javascript'; // On active !
        
        // Remplacer l'ancien script inactif par le nouveau actif
        oldScript.parentNode.replaceChild(newScript, oldScript);
        console.log(`🍪 Script RGPD activé : ${category}`);
    });
}
/* =================================================================
   🤖 MODULE CHATBOT KICKS - VERSION OMNISCIENTE FINALE (MODIFIÉE)
   ================================================================= */

// 1. FONCTIONS GLOBALES (Accessibles par l'index.html)
window.toggleKicksChat = function() {
    const chatWin = document.getElementById('kicks-chat-window');
    if (chatWin) chatWin.classList.toggle('chat-hidden');
    const notif = document.getElementById('chatbot-notif');
    if (notif) notif.style.display = 'none';
};

window.handleChatKey = function(e) { 
    if (e.key === 'Enter') sendChatMessage(); 
};

// 2. MOTEUR DE RÉPONSES DU BOT
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const qRaw = input.value.trim();
    const q = qRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!q) return;

    appendMessage('user', qRaw);
    input.value = '';

    setTimeout(() => {
        let r = "";

        // --- A. RECHERCHE PRODUITS, PRIX & TAILLES ---
        const keywords = q.replace(/(combien|coute|prix|tarif|le|la|les|achat)/g, "").split(' ').filter(w => w.length > 1);
        const found = state.products ? state.products.filter(p => {
            const name = `${p.Brand || ''} ${p.Model || ''}`.toLowerCase();
            return keywords.every(kw => name.includes(kw));
        }) : [];

        if (found.length > 0 && keywords.length > 0) {
            r = "<strong>🔍 Stock trouvé :</strong><br>" + found.slice(0, 3).map(p => {
                const sizes = Object.entries(p).filter(([k, v]) => !isNaN(k.replace(',', '.')) && Number(v) > 0).map(([s]) => s).join(', ');
                const prix = p.Price || p.Prix || "Vérifier fiche";
                return `• <strong>${p.Brand} ${p.Model}</strong><br>💰 Prix : <strong>${prix}€</strong><br>📏 Tailles : ${sizes || 'Voir fiche'}`;
            }).join('<br><br>');
        }

        // --- B. LIVRAISON PRÉCISE (DÉTECTION ZONES SENSITIVES) ---
        else if (q.match(/(livraison|frais|port|express|24h|tarif|guyane|martinique|abymes|gosier|mahault|pitre|moule|eau|anne|france)/)) {
            const isFrance = q.match(/(france|metropole|hexagone)/);
            const isGuyaneMartinique = q.match(/(guyane|martinique)/);
            const isSensitive = q.match(/(abymes|gosier|mahault|pitre|moule|eau|anne|express|24h)/);

            if (isFrance) {
                r = "<strong>📍 Zone France Hexagonale :</strong><br>• Frais : 30€.<br>• OFFERT dès 400€.";
            } else if (isGuyaneMartinique) {
                r = "<strong>📍 Zone Guyane / Martinique :</strong><br>• Colissimo : 16.60€.<br>• OFFERT dès 150€.<br>⚠️ <em>L'Express 24h n'est pas disponible pour cette zone.</em>";
            } else if (isSensitive) {
                r = "<strong>🚀 Zone Guadeloupe (Sensitive) :</strong><br>• Colissimo : 16.60€ (OFFERT dès 150€).<br>• <strong>Express 24h : 20€</strong> (Option rapide).";
            } else {
                r = "<strong>📦 Livraison Antilles / Guyane :</strong><br>• Standard : 16.60€ (OFFERT dès 150€).<br>• Express 24h (20€) disponible sur zones sensitives Guadeloupe.";
            }
        }

        // --- C. CGV, POIDS, SUIVI & RESPONSABILITÉ (URL MODIFIÉE) ---
        else if (q.match(/(cgv|condition|loi|retour|retractation|14|jours|poids|kg|perte|vol|adresse|suivre|suivi)/)) {
            r = "<strong>⚖️ CGV & INFOS PRATIQUES :</strong><br>" +
                "• <strong>Lien direct :</strong> <a href='https://cgv.kixx.fr' target='_blank' style='color:#f39c12; font-weight:bold;'>Consulter nos CGV</a><br>" +
                "• <strong>Suivi :</strong> <a href='https://www.laposte.fr/outils/suivre-vos-envois' target='_blank'>Suivre mon colis La Poste</a><br>" +
                "• <strong>Poids :</strong> Limite de 10kg (~5 paires).<br>" +
                "• <strong>Responsabilité :</strong> KICKS n'est pas responsable des vols/pertes ou erreurs d'adresse.<br>" +
                "• <strong>Retours :</strong> 14 jours (kixx.retour@gmail.com).";
        }

        // --- D. PAIEMENT & SÉCURITÉ ---
        else if (q.match(/(paiement|4x|paypal|stripe|klarna|securise|3d|ssl)/)) {
            r = "<strong>💳 Paiement & Sécurité :</strong><br>• SSL & 3D Secure certifié.<br>• <strong>PayPal (4X sans frais)</strong>, Klarna, CB.";
        }

        // --- E. MENTIONS LÉGALES & SIÈGE (URL MODIFIÉE) ---
        else if (q.match(/(mention|siege|societe|siret|adresse|rl|legal)/)) {
            r = "<strong>📜 Mentions Légales :</strong><br>" +
                "• <strong>Lien direct :</strong> <a href='https://ml.kixx.fr' target='_blank' style='color:#f39c12; font-weight:bold;'>Consulter les Mentions Légales</a><br>" +
                "• E.I RL KICKS (SIRET: 990 351 702 00016).<br>• Siège : Rés Les Esses 3, Bat 28, 97139 Les Abymes.";
        }

        // --- PAR DÉFAUT ---
        else {
            r = "Je connais le prix des <strong>produits</strong>, les tarifs <strong>Guyane/DOM</strong>, les <strong><a href='https://cgv.kixx.fr' target='_blank'>CGV</a></strong> et le <strong>suivi de colis</strong>. Que puis-je faire pour toi ?";
        }

        appendMessage('bot', r);
    }, 400);
}

function appendMessage(sender, text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    
    // --- AJOUT DE LA TÊTE DE ROBOT (PNG DANS ASSETS) ---
    if (sender === 'bot') {
        const avatar = document.createElement('img');
        avatar.src = 'assets/robot.png';
        avatar.className = 'bot-avatar';
        // Petit robot emoji si l'image robot.png n'est pas trouvée
        avatar.onerror = function() { this.replaceWith("🤖 "); };
        msgDiv.prepend(avatar);
    }
    
    const textSpan = document.createElement('span');
    textSpan.innerHTML = text;
    msgDiv.appendChild(textSpan);
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

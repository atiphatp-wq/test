document.addEventListener('DOMContentLoaded', () => {
    // --- Smooth Scroll & Menu ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
        });
    });

    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => { navLinks.classList.toggle('active'); });
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => { navLinks.classList.remove('active'); });
        });
    }

    console.log("Portfolio script loaded.");

    // --- DOM Elements ---
    const pdfModal = document.getElementById("pdfModal");
    const pdfFrame = document.getElementById("pdfFrame");
    const downloadLink = document.getElementById("downloadLink");
    const closePdfBtn = document.querySelector(".close-modal");

    const lightboxModal = document.getElementById("lightboxModal");
    const carouselEl = document.getElementById("carousel"); // The rotating container
    const carouselScene = document.querySelector(".carousel-scene"); // For hover pause
    const closeLightboxBtn = document.querySelector(".lightbox-close");
    const prevBtn = document.querySelector(".lightbox-prev");
    const nextBtn = document.querySelector(".lightbox-next");

    // --- Configuration ---
    const SECTION_KEYS = ["1-1", "1-2", "1-3", "1-4", "1-5", "2-1", "2-2", "3-1", "3-2"];

    // State
    let sectionData = {};
    let imageData = {};

    // 3D Carousel State
    let carouselAngle = 0;
    let carouselTheta = 0;
    let carouselRadius = 0;
    let currentImageCount = 0;
    let animationId = null;
    let isAutoRotating = false;
    let isHovering = false;

    // --- IndexedDB Persistence ---
    const DB_NAME = "PortfolioDB";
    const DB_VERSION = 1;
    const STORE_NAME = "files";
    let db;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                    store.createIndex("section", "section", { unique: false });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log("IndexedDB opened successfully");
                resolve(db);
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.errorCode);
                reject("IndexedDB error");
            };
        });
    }

    function addFileToDB(fileData) {
        return new Promise((resolve, reject) => {
            if (!db) {
                console.error("DB not initialized");
                reject("DB not initialized");
                return;
            }
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(fileData);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function removeFileFromDB(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    function getAllFilesFromDB() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // --- Data Loading ---
    async function loadData() {
        try {
            await openDB();
            const allFiles = await getAllFilesFromDB();

            // Revoke old URLs to prevent memory leaks
            SECTION_KEYS.forEach(k => {
                if (sectionData[k]) sectionData[k].forEach(f => URL.revokeObjectURL(f.url));
                if (imageData[k]) imageData[k].forEach(f => URL.revokeObjectURL(f.url));
            });

            // Clear current state
            sectionData = {};
            imageData = {};

            // Initialize Headers (optional, if you want empty lists to verify they exist)
            SECTION_KEYS.forEach(k => {
                sectionData[k] = [];
                imageData[k] = [];
            });

            // Distribute files
            allFiles.forEach(item => {
                // Reconstruct URL for display
                const fileUrl = URL.createObjectURL(item.blob);
                const entry = {
                    id: item.id,
                    name: item.name,
                    url: fileUrl,
                    isDefault: false
                };

                if (item.type === 'pdf') {
                    if (!sectionData[item.section]) sectionData[item.section] = [];
                    sectionData[item.section].push(entry);
                } else if (item.type === 'image') {
                    if (!imageData[item.section]) imageData[item.section] = [];
                    imageData[item.section].push(entry);
                }
            });

            // Set Default if empty (only for 1-1 example logic)
            if (sectionData["1-1"].length === 0) {
                // Note: We can't easily put a default local file into IDB logic without fetching it as blob first.
                // For now, we'll just leave the static default in the UI if we want, or skip it.
                // Keeping it simple: No default file if IDB is empty to avoid complexity.
            }

            renderAll();

        } catch (err) {
            console.error("Failed to load data from DB:", err);
        }
    }

    // No explicit saveData() needed as we save on action

    // --- Rendering ---
    function renderAll() {
        SECTION_KEYS.forEach(key => {
            renderPdfList(key);
            renderImageList(key);
        });
    }

    function renderPdfList(key) {
        const list = document.getElementById(`pdfList-${key}`);
        if (!list) return;

        // list.innerHTML = ""; // Don't clear static HTML!
        const files = sectionData[key] || [];

        files.forEach((file, index) => {
            const li = document.createElement("li");
            li.className = "pdf-item";

            // Use ID if available, else index (for legacy/default) - though now everything has ID from DB
            const deleteAttr = file.id
                ? `onclick="event.stopPropagation(); deletePdf('${key}', ${file.id})"`
                : `style="display:none"`; // Hide delete for static/default if any

            li.innerHTML = `
                <div class="pdf-info" onclick="openPdfModal('${file.url}')">
                    <i class="fa-solid fa-file-pdf"></i> <span>${file.name}</span>
                </div>
                <button class="delete-btn" ${deleteAttr} title="ลบ">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
            list.appendChild(li);
        });
    }

    function renderImageList(key) {
        const grid = document.getElementById(`imgList-${key}`);
        if (!grid) return;

        // grid.innerHTML = ""; // Don't clear static HTML!
        const images = imageData[key] || [];

        const viewBtn = document.getElementById(`viewBtn-${key}`);
        if (viewBtn) {
            // Allow static or dynamic images to trigger button visibility
            // Simple fix: Always show if there are elements in the grid or logic?
            // For now, let's just uncomment the line that hides it or make it smarter.
            // Actually, if we have static images, we probably want the button visible.
            // Let's change the logic to check `grid.children.length` or similar.
            if (images.length > 0 || grid.children.length > 0) {
                viewBtn.style.display = "inline-flex";
            }
        }

        images.forEach((img, index) => {
            const div = document.createElement("div");
            div.className = "image-item";
            div.onclick = () => openLightbox(key, index);

            const deleteAttr = img.id
                ? `onclick="event.stopPropagation(); deleteImage('${key}', ${img.id})"`
                : `style="display:none"`;

            div.innerHTML = `
                <img src="${img.url}" loading="lazy">
                <button class="image-delete-btn" ${deleteAttr}>
                    <i class="fa-solid fa-times"></i>
                </button>
            `;
            grid.appendChild(div);
        });
    }

    // --- Actions ---
    window.deletePdf = async function (key, id) {
        if (!confirm("Are you sure you want to delete this file?")) return;
        try {
            await removeFileFromDB(id);
            // Reload to refresh state
            await loadData();
        } catch (e) {
            console.error("Delete failed", e);
            alert("Failed to delete file.");
        }
    };

    window.deleteImage = async function (key, id) {
        if (!confirm("Are you sure you want to delete this image?")) return;
        try {
            await removeFileFromDB(id);
            await loadData();
        } catch (e) {
            console.error("Delete failed", e);
            alert("Failed to delete image.");
        }
    };

    // --- Event Listeners (Uploads) ---
    document.body.addEventListener('change', function (e) {
        if (e.target.matches('input[type="file"][data-section]')) {
            const input = e.target;
            const key = input.dataset.section;
            const type = input.dataset.type; // 'image' or undefined(pdf)
            const files = Array.from(input.files);

            if (type === 'image') {
                handleImageUpload(key, files);
            } else {
                handlePdfUpload(key, files);
            }
            input.value = '';
        }
    });

    async function handlePdfUpload(key, files) {
        if (!files || files.length === 0) return;

        for (const file of files) {
            if (file.type !== "application/pdf") {
                alert(`File ${file.name} is not a PDF. Skipping.`);
                continue;
            }
            // IndexedDB handles large files well, but let's keep a sanity limit like 100MB if needed, 
            // otherwise remove limit or verify with user.
            // User asked to fix large file issue, so let's remove the 5MB limit check.

            try {
                await addFileToDB({
                    section: key,
                    type: 'pdf',
                    name: file.name,
                    blob: file, // Store the File object directly
                    createdAt: new Date()
                });
            } catch (e) {
                console.error("Upload error", e);
                alert(`Failed to save ${file.name}: ${e.message}`);
            }
        }
        await loadData();
    }

    async function handleImageUpload(key, files) {
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;

            try {
                await addFileToDB({
                    section: key,
                    type: 'image',
                    name: file.name,
                    blob: file,
                    createdAt: new Date()
                });
            } catch (e) {
                console.error("Upload error", e);
                alert(`Failed to save ${file.name}: ${e.message}`);
            }
        }
        await loadData();
    }

    // --- PDF Modal ---
    window.openPdfModal = function (url) {
        if (pdfModal) {
            pdfFrame.src = url;
            downloadLink.href = url;
            pdfModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    };

    // --- 3D Carousel Lightbox Logic ---
    window.openLightbox = function (key, selectedIndex) {
        let imgs = imageData[key] || [];

        // If no DB images, check for static images in the DOM
        if (imgs.length === 0) {
            const grid = document.getElementById(`imgList-${key}`);
            if (grid) {
                const domImgs = grid.querySelectorAll("img");
                imgs = Array.from(domImgs).map(img => ({ url: img.src }));
            }
        }

        if (!imgs || imgs.length === 0) return;

        currentImageCount = imgs.length;
        carouselEl.innerHTML = ""; // Clear old

        // 1. Calculate Geometry
        const width = 600; // Match CSS base width
        const gap = 30;    // Spacing

        if (currentImageCount === 1) {
            carouselRadius = 0;
            carouselTheta = 0;
        } else {
            carouselTheta = 360 / currentImageCount;
            const perimeter = (width + gap) * currentImageCount;
            carouselRadius = Math.round((perimeter / 2) / Math.PI);
            carouselRadius = Math.max(carouselRadius, 250);
        }

        // 2. Build Items
        imgs.forEach((img, i) => {
            const item = document.createElement('div');
            item.className = 'carousel-item-3d';
            item.innerHTML = `<img src="${img.url}">`;

            // Layout in Circle
            const angle = carouselTheta * i;
            item.style.transform = `rotateY(${angle}deg) translateZ(${carouselRadius}px)`;
            item.dataset.index = i;
            carouselEl.appendChild(item);
        });

        // 3. Set Initial Rotation
        carouselAngle = -(selectedIndex * carouselTheta);
        updateCarousel();

        // 4. Show Modal & Start Animation
        lightboxModal.style.display = 'flex';

        // Start Auto Rotation
        startAnimation();
    };

    function updateCarousel() {
        const zOffset = -carouselRadius;
        // Apply transform
        carouselEl.style.transform = `translateZ(${zOffset}px) rotateY(${carouselAngle}deg)`;
    }

    // Animation Loop
    function animateCarousel() {
        if (!isAutoRotating) return;

        if (!isHovering) {
            // Spin slowly to the left (decrement angle)
            carouselAngle -= 0.2;
            updateCarousel();
        }

        animationId = requestAnimationFrame(animateCarousel);
    }

    function startAnimation() {
        if (animationId) cancelAnimationFrame(animationId);
        isAutoRotating = true;
        isHovering = false;
        animateCarousel();
    }

    function stopAnimation() {
        isAutoRotating = false;
        if (animationId) cancelAnimationFrame(animationId);
    }

    // Hover Interaction
    if (carouselScene) {
        carouselScene.addEventListener('mouseenter', () => { isHovering = true; });
        carouselScene.addEventListener('mouseleave', () => { isHovering = false; });
    }

    function rotateNext() {
        carouselAngle -= carouselTheta;
        updateCarousel();
    }

    function rotatePrev() {
        carouselAngle += carouselTheta;
        updateCarousel();
    }

    // Modal Close logic helper
    function closeLightbox() {
        lightboxModal.style.display = 'none';
        document.body.style.overflow = '';
        stopAnimation();
    }

    // Modal Close/Nav Events
    if (closePdfBtn) closePdfBtn.onclick = () => { pdfModal.style.display = 'none'; document.body.style.overflow = ''; pdfFrame.src = ''; };
    if (closeLightboxBtn) closeLightboxBtn.onclick = () => { closeLightbox(); };

    // Note: Clicking buttons will jump rotation, animation continues from there
    if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); rotateNext(); };
    if (prevBtn) prevBtn.onclick = (e) => { e.stopPropagation(); rotatePrev(); };

    window.onclick = function (event) {
        if (event.target == pdfModal) {
            pdfModal.style.display = 'none';
            document.body.style.overflow = '';
            pdfFrame.src = '';
        }
        if (event.target == lightboxModal) {
            closeLightbox();
        }
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            pdfModal.style.display = 'none';
            if (lightboxModal.style.display === 'flex') closeLightbox();
            document.body.style.overflow = '';
        }
        if (lightboxModal.style.display === 'flex') {
            if (e.key === "ArrowRight") rotateNext();
            if (e.key === "ArrowLeft") rotatePrev();
        }
    });

    // Init
    loadData();
    renderAll();
});

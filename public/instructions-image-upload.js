// Multi-Image Upload Handler for Instructions

// State
let addImages = [];
let editImages = [];

// --- Add Modal Logic ---

// Trigger file input
document.getElementById('addMoreImagesBtn')?.addEventListener('click', () => {
    document.getElementById('addGalleryInput').click();
});

// Handle File Select & Upload
document.getElementById('addGalleryInput')?.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show spinner
    const spinner = document.getElementById('addUploadSpinner');
    const status = document.getElementById('addUploadStatus');
    spinner.classList.remove('d-none');
    status.textContent = 'جاري الرفع...';

    // Upload
    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/dashboard/instructions/upload-image', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();

        // Add to state
        addImages.push({
            url: data.imageUrl,
            description: '' // Empty initially
        });

        // Update UI
        renderAddGallery();

        status.textContent = '✅ تم';
        setTimeout(() => status.textContent = '', 2000);
    } catch (error) {
        console.error('Upload error:', error);
        status.textContent = '❌ فشل الرفع';
    } finally {
        spinner.classList.add('d-none');
        e.target.value = ''; // Reset input
    }
});

function renderAddGallery() {
    const container = document.getElementById('addImagesContainer');
    if (!container) return;
    container.innerHTML = '';

    addImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item-card';
        item.innerHTML = `
            <button type="button" class="gallery-item-delete" onclick="removeAddImage(${index})" title="حذف">
                <i class="bi bi-x"></i>
            </button>
            <img src="${img.url}" class="gallery-item-img">
            <div class="gallery-item-desc">
                <input type="text" class="form-control bg-dark text-white border-secondary" 
                    placeholder="وصف الصورة (مثال: أحمر)" 
                    value="${img.description}" 
                    onchange="updateAddDescription(${index}, this.value)">
            </div>
        `;
        container.appendChild(item);
    });

    // Update hidden input
    document.getElementById('addImageUrlJson').value = JSON.stringify(addImages);
}

function updateAddDescription(index, value) {
    addImages[index].description = value;
    document.getElementById('addImageUrlJson').value = JSON.stringify(addImages);
}

function removeAddImage(index) {
    // Optional: Delete from server (can be skipped for simplicity, or implemented if strict cleanup needed)
    // fetch('/dashboard/instructions/delete-image', ...) 

    addImages.splice(index, 1);
    renderAddGallery();
}

// Reset Add Modal
document.getElementById('addModal')?.addEventListener('hidden.bs.modal', function () {
    addImages = [];
    renderAddGallery();
    document.querySelector('#addModal form').reset();
});


// --- Edit Modal Logic ---

// Trigger file input
document.getElementById('editMoreImagesBtn')?.addEventListener('click', () => {
    document.getElementById('editGalleryInput').click();
});

// Handle File Select & Upload
document.getElementById('editGalleryInput')?.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const spinner = document.getElementById('editUploadSpinner');
    const status = document.getElementById('editUploadStatus');
    spinner.classList.remove('d-none');
    status.textContent = 'جاري الرفع...';

    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/dashboard/instructions/upload-image', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();

        editImages.push({
            url: data.imageUrl,
            description: ''
        });

        renderEditGallery();

        status.textContent = '✅ تم';
        setTimeout(() => status.textContent = '', 2000);
    } catch (error) {
        console.error('Upload error:', error);
        status.textContent = '❌ فشل الرفع';
    } finally {
        spinner.classList.add('d-none');
        e.target.value = '';
    }
});

function renderEditGallery() {
    const container = document.getElementById('editImagesContainer');
    if (!container) return;
    container.innerHTML = '';

    editImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item-card';
        item.innerHTML = `
            <button type="button" class="gallery-item-delete" onclick="removeEditImage(${index})" title="حذف">
                <i class="bi bi-x"></i>
            </button>
            <img src="${img.url}" class="gallery-item-img">
            <div class="gallery-item-desc">
                <input type="text" class="form-control bg-dark text-white border-secondary" 
                    placeholder="وصف الصورة" 
                    value="${img.description || ''}" 
                    onchange="updateEditDescription(${index}, this.value)">
            </div>
        `;
        container.appendChild(item);
    });

    document.getElementById('editImageUrlJson').value = JSON.stringify(editImages);
}

function updateEditDescription(index, value) {
    editImages[index].description = value;
    document.getElementById('editImageUrlJson').value = JSON.stringify(editImages);
}

function removeEditImage(index) {
    editImages.splice(index, 1);
    renderEditGallery();
}

// --- Dynamic Keywords Tag Input Logic ---
window.currentEditTags = [];

function renderEditTags() {
    const hiddenInput = document.getElementById('editKeywords');
    const container = document.getElementById('editTagsContainer');
    if (!container || !hiddenInput) return;
    
    hiddenInput.value = window.currentEditTags.join(',');
    
    // Remove old tags from DOM
    container.querySelectorAll('.edit-kw-tag').forEach(e => e.remove());
    
    // Inject tags
    const inputEl = document.getElementById('editTagInput');
    window.currentEditTags.forEach((tag, index) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'edit-kw-tag badge bg-primary d-flex align-items-center gap-1';
        tagEl.style.fontSize = '12px';
        tagEl.style.padding = '5px 8px';
        tagEl.innerHTML = `${tag} <i class="bi bi-x-circle text-white-50 ms-1" style="cursor:pointer;" onclick="removeEditTag(${index})" title="حذف"></i>`;
        container.insertBefore(tagEl, inputEl);
    });
}

window.removeEditTag = function (index) {
    window.currentEditTags.splice(index, 1);
    renderEditTags();
};

document.addEventListener('DOMContentLoaded', () => {
    const inputEl = document.getElementById('editTagInput');
    if (inputEl) {
        inputEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = this.value.trim().replace(/,/g, '');
                if (val && !window.currentEditTags.includes(val)) {
                    window.currentEditTags.push(val);
                    renderEditTags();
                }
                this.value = '';
            }
        });
        
        // Prevent form submission when pressing enter inside tag input
        inputEl.closest('form')?.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.target.id === 'editTagInput') {
                e.preventDefault();
            }
        });
    }
});

// Initialize Edit Modal
window.editInstruction = function (btn) {
    try {
        const id = btn.getAttribute('data-id');
        const clientName = decodeURIComponent(btn.getAttribute('data-client-name') || '');
        const content = decodeURIComponent(btn.getAttribute('data-content') || '');
        const actionTarget = decodeURIComponent(btn.getAttribute('data-action-target') || '');
        const imageUrlRaw = decodeURIComponent(btn.getAttribute('data-image-url') || '');
        const keywords = decodeURIComponent(btn.getAttribute('data-keywords') || '');

        document.getElementById('editId').value = id;
        document.getElementById('editClientName').value = clientName;
        document.getElementById('editContent').value = content;
        document.getElementById('editActionTarget').value = actionTarget || '';
        
        // Initialize tags
        window.currentEditTags = keywords ? keywords.split(',').map(k => k.trim()).filter(k => k) : [];
        if(typeof renderEditTags === 'function') renderEditTags();

        // Update form action to include the ID
        const editForm = document.querySelector('#editModal form');
        editForm.action = `/dashboard/instructions/edit/${id}`;

        // Parse Image URL (JSON or String)
        editImages = [];
        if (imageUrlRaw && imageUrlRaw !== 'null' && imageUrlRaw !== '') {
            try {
                if (imageUrlRaw.startsWith('[')) {
                    editImages = JSON.parse(imageUrlRaw);
                } else {
                    // Legacy support for single string URL
                    editImages = [{ url: imageUrlRaw, description: 'صورة' }];
                }
            } catch (e) {
                console.error("Failed to parse image JSON", e);
                editImages = [{ url: imageUrlRaw, description: 'صورة' }];
            }
        }

        renderEditGallery();

        const modalElement = document.getElementById('editModal');
        const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
        modal.show();
    } catch (err) {
        alert("حدث خطأ أثناء فتح التعديل: " + err.message);
        console.error(err);
    }
};



// --- Dynamic Group Refresh Logic ---
// --- Dynamic Group Refresh Logic ---
let currentPage = 1;

async function refreshGroups(isReload = true) {
    const btn = document.getElementById('refreshGroupsBtn');
    const editBtn = document.getElementById('refreshEditGroupsBtn');

    if (isReload) {
        currentPage = 1;
        if (btn) btn.innerHTML = '⏳';
        if (editBtn) editBtn.innerHTML = '⏳';
    }

    try {
        const response = await fetch(`/dashboard/groups?page=${currentPage}`);
        if (!response.ok) throw new Error('فشل جلب الجروبات');

        const groups = await response.json();
        const selects = [document.getElementById('addActionTarget'), document.getElementById('editActionTarget')];

        selects.forEach(select => {
            if (!select) return;

            const currentVal = select.value || select.getAttribute('data-selected-val');

            // If reloading, clear options but keep the header
            if (isReload) {
                select.innerHTML = '<option value="">-- اختر الجروب --</option>';
            } else {
                // If loading more, remove the "Load More" option if it exists
                const loadMoreOpt = select.querySelector('option[data-type="load-more"]');
                if (loadMoreOpt) loadMoreOpt.remove();
            }

            if (groups.length > 0) {
                groups.forEach(g => {
                    // Prevent duplicates
                    if (!select.querySelector(`option[value="${g.subject}"]`)) {
                        const option = document.createElement('option');
                        option.value = g.subject;
                        option.textContent = g.subject;
                        select.appendChild(option);
                    }
                });

                // Add "Load More" option if we got a full page (assuming limit 10)
                if (groups.length === 10) {
                    const loadMore = document.createElement('option');
                    loadMore.textContent = '🔽 تحميل المزيد...';
                    loadMore.value = "LOAD_MORE_ACTION";
                    loadMore.style.fontWeight = 'bold';
                    loadMore.style.color = '#10b981';
                    loadMore.setAttribute('data-type', 'load-more');
                    select.appendChild(loadMore);

                    // Add listener to load next page when selected
                    select.onchange = function () {
                        if (this.value === 'LOAD_MORE_ACTION') {
                            currentPage++;
                            refreshGroups(false); // Load more
                            this.value = currentVal; // Restore selection visually
                        }
                    };
                }
            } else {
                if (isReload) select.innerHTML += '<option value="" disabled>⚠️ لا توجد جروبات متاحة</option>';
            }

            // Restore selection if value matches
            if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
                select.value = currentVal;
            } else if (currentVal && !isReload) {
                // Keep selection even if not in new batch
            }
        });

        if (isReload) {
            if (btn) btn.innerHTML = '🔄';
            if (editBtn) editBtn.innerHTML = '🔄';
            // alert('تم تحديث قائمة الجروبات بنجاح! ✅'); // Alert removed to be less annoying on auto-load
        } else {
            // alert('تم تحميل المزيد من الجروبات');
        }

    } catch (error) {
        console.error(error);
        if (isReload) alert('تعذر جلب الجروبات. تأكد من ربط الواتساب أولاً. ⚠️');
        if (btn) btn.innerHTML = '🔄';
        if (editBtn) editBtn.innerHTML = '🔄';
    }
}

// Auto-load on start
document.addEventListener('DOMContentLoaded', () => {
    // Preserve selected value from HTML (if editing or previously selected)
    const selects = [document.getElementById('addActionTarget'), document.getElementById('editActionTarget')];
    selects.forEach(s => {
        if (s && s.value) s.setAttribute('data-selected-val', s.value);
    });

    refreshGroups(true);
});

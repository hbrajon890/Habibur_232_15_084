# Tender Document Package Builder
**AI DevFest 2026 Vibe-Coding Contest Submission**

A professional, 100% client-side web application designed for office and procurement staff to compile, validate, order, and merge tender document submissions into a verified, single PDF package.

---

## 🌟 Key Highlights & Architectural Guarantees

1. **Zero Backend / 100% In-Browser Execution**:
   - Built exclusively with **HTML5, CSS3, and Vanilla JavaScript**.
   - No React, Vue, Angular, backend servers, Firebase, Supabase, or external database.
   - All PDF parsing, SHA-256 cryptographic hashing, page merging, cover page generation, and footer stamping occur directly in the browser memory using **WebCrypto** and **pdf-lib**.
   - **Zero Data Leakage**: User tender documents are never transmitted over the network.

2. **Strict Official Status Rules**:
   Every required document evaluates to exactly one of the five official statuses:
   - **Missing** (`mandatory: true`, no file matched) -> *Blocking: YES*
   - **Expiry date needed** (`has_expiry: true`, file matched, date empty) -> *Blocking: YES*
   - **Expired** (`expiry_date < submission_deadline`) -> *Blocking: YES*
   - **Not provided** (`mandatory: false`, no file matched) -> *Blocking: NO*
   - **OK** (matched, and if `has_expiry: true`, `expiry_date >= submission_deadline`) -> *Blocking: NO*
   *Note: If expiry date equals submission deadline, status is strictly `OK`.*

3. **Content-Based Duplicate Detection (SHA-256)**:
   - Uses `crypto.subtle.digest("SHA-256", fileBytes)`.
   - Detects duplicate files based on **exact file content**, not filenames.
   - Two files with different filenames but identical contents are detected as duplicates and cannot be matched to different requirements.

4. **Document Matching & Smart Auto-Match**:
   - 1-to-1 matching: One requirement -> maximum one file; one file -> maximum one requirement.
   - Optional intelligent auto-matching suggests matches based on filename similarity without forcing assignment.
   - Users can accept, change, or undo matches at any time.

5. **Dynamic Requirements Loading**:
   - Loads and parses any custom `requirements.json` dynamically.
   - Requirements are automatically sorted in **ascending order (`order ASC`)**.
   - Defaults to an included sample tender configuration if opened directly.

6. **Bilingual UI Switching (English / বাংলা)**:
   - Complete, instantaneous bilingual UI switching (English | বাংলা) powered by a centralized translation dictionary (`translations.js`).
   - Uses `title_en` and `title_bn` dynamically for document titles.

7. **PDF Package Compilation & Download**:
   - **Page 1 (Cover Page)**: Professional English cover page with Tender ID, Tender Title, Procuring Entity, Bidder Name, Submission Deadline, Package Made Date, and sequential table of included documents.
   - **Bonus Feature (Page 2 - Table of Contents / Index)**: Sequential table of contents listing document starting page numbers.
   - **Exact Order Merge**: Merges all pages of included documents in their exact `order ASC`.
   - **Sequential Universal Footer**: Stamps `<tender_id> | Page X of Y` on every page (including the cover and index), with `Y` representing the total pages in the final package.
   - **Standardized Filename**: Automatically downloads as `<tender_id>_Package.pdf` (e.g., `T-2026-0417_Package.pdf`).

---

## 📁 Project Structure

```
vibe coding/
├── index.html              # Main HTML5 application structure
├── styles.css              # Office-document dashboard styling (responsive, accessible)
├── translations.js         # Centralized bilingual English/Bangla dictionary
├── app.js                  # Vanilla JS application state, matching, WebCrypto, & pdf-lib compilation
├── requirements.json       # Sample tender requirements schema
├── sample_docs/            # Generated sample test PDFs (including duplicate content files)
├── generate_samples.js     # Script to generate sample PDF files for testing
├── test_logic.js           # Test suite verifying order sorting, statuses, & SHA-256 duplicate detection
└── README.md               # Complete project documentation
```

---

## 🚀 How to Run the Application

Because this application is 100% client-side, you can run it in any modern browser:

### Option 1: Direct File Open
Simply double-click `index.html` or open it with your web browser (Chrome, Edge, Firefox, Safari).

### Option 2: Local HTTP Server (Recommended)
You can serve the directory using any standard static file server:

```powershell
# Using Python
python -m http.server 8080

# Or using Node npx
npx serve .
```
Then navigate to `http://localhost:8080` in your browser.

---

## 🧪 Testing with Sample Files

1. Click **"Load Requirements.json"** (or use the preloaded default tender).
2. Drag and drop the PDF files located in `sample_docs/` into the upload zone:
   - `trade_license_2026.pdf`
   - `trade_license_duplicate_copy.pdf` *(identical content - triggers SHA-256 duplicate badge)*
   - `tin_certificate.pdf`
   - `vat_registration_bin.pdf`
   - `bank_solvency_certificate.pdf`
   - `iso_9001_quality_certificate.pdf`
   - `manufacturer_authorization_form.pdf`
3. Notice the **Auto-Match by Filename** suggestion chips appearing on the checklist.
4. Try assigning dates to test the official status rules:
   - Set an expiry date before `2026-10-20` -> Status becomes **Expired** (Generation button disabled).
   - Set an expiry date on `2026-10-20` or after -> Status becomes **OK**.
5. Once all mandatory documents are **OK**, click **"Generate & Download Final Package"**.
6. Inspect the downloaded `<tender_id>_Package.pdf` containing the cover page, table of contents index, merged documents, and sequential footer.


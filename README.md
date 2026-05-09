# EASY-CAP 📸
### Professional Batch Image Captioning for LoRA Training

EASY-CAP is a high-performance, browser-based utility designed to streamline the process of annotating large datasets for machine learning, specifically LoRA (Low-Rank Adaptation) training. Powered by xAI's **Grok Vision** engines, it generates precise, natural-language captions that strictly adhere to training best practices.

![EASY-CAP Preview](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1000)

## ✨ Key Features

*   **🚀 Grok-Powered Intelligence**: Integrates directly with xAI API, supporting `Grok 4.1 Fast` and `Grok 2 Vision` for high-fidelity image analysis.
*   **📂 Batch Processing**: Upload hundreds of images and process them sequentially with built-in **Pause**, **Resume**, and **Stop** controls.
*   **💾 Robust Persistence**: Uses **IndexedDB** (`idb-keyval`) to locally store your image files and **LocalStorage** for captions/settings. Your data stays in the browser even after a page refresh.
*   **🎯 LoRA Optimized**: Default system prompts are tuned to ignore noise (watermarks, tattoos, technical camera angles) and focus on repeatable features essential for training.
*   **📦 Flexible Export**: 
    *   **Single Download**: Grab a `.txt` file for any individual image.
    *   **Bulk Export**: Download all generated captions in a single, organized **ZIP file** with filenames matching your original images.
*   **🎨 Pro UI/UX**: A dark, "Obsidian" themed interface built with Tailwind CSS, featuring a responsive bento-grid layout.

## 🛠️ Technical Stack

*   **Frontend**: React 18, Vite, TypeScript
*   **Styling**: Tailwind CSS + Framer Motion
*   **Storage**: IndexedDB (`idb-keyval`) for binary data, LocalStorage for state.
*   **API**: Express (Node.js) backend proxying requests to xAI.
*   **Utils**: `JSZip` for bundling, `file-saver` for downloads.

## 🚀 Getting Started

### 1. Prerequisites
You will need a valid **xAI (Grok) API Key**. You can obtain one from the [xAI Console](https://console.x.ai/).

### 2. Configuration
1.  Open the **EASY-CAP** dashboard.
2.  In the left sidebar, paste your **Grok API Key**.
3.  Set your **Trigger Word** (this is the unique identifier for your LoRA subject).
4.  (Optional) Fine-tune the **System Prompt** if you need specific terminology for your dataset.

### 3. Usage
1.  **Upload**: Drag and drop your training images into the central upload zone.
2.  **Process**: Click **Process All** to start the batch sequence. You can monitor the progress at the bottom of the screen.
3.  **Review**: Click any image to view it full-screen and manually edit the generated caption if needed.
4.  **Download**: Click **Download All (ZIP)** to get your dataset ready for training.

## 🛡️ Critical Rules for Captions
The system is pre-configured with a "Hardened Captioning" rule-set to ensure high-quality training:
*   **No PII**: Ignores tattoos, jewelry, and unique identifiers.
*   **No Noise**: Strictly ignores watermarks, logos, and overlaid text.
*   **Concise**: Limits output to 15-35 words to prevent overfitting on descriptive filler.
*   **Focus**: Prioritizes subject state, textures, and repeatable characteristics.

## 📄 License
MIT License - Developed with ❤️ for the AI community.

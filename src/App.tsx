import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  Settings, 
  Save, 
  Download, 
  Trash2, 
  ChevronRight, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Type,
  Sliders,
  Image as ImageIcon,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as idbKeyval from 'idb-keyval';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface ImageFile {
  id: string;
  file: File;
  preview: string;
  caption: string;
  status: 'idle' | 'processing' | 'done' | 'error';
  error?: string;
}

interface AppSettings {
  apiKey: string;
  triggerWord: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  detail: 'low' | 'high' | 'auto';
}

const CAPTION_MODES = [
  { 
    id: 'bodypart', 
    name: 'Body Part', 
    defaultTrigger: 'hairy pussy',
    description: 'Optimized for specific anatomy / textures' 
  },
  { 
    id: 'character', 
    name: 'Character', 
    defaultTrigger: 'my_character',
    description: 'People, outfits, poses, expressions' 
  },
  { 
    id: 'general', 
    name: 'General Scene', 
    defaultTrigger: 'my_scene',
    description: 'Full images, environments, composition' 
  },
  { 
    id: 'object', 
    name: 'Specific Object', 
    defaultTrigger: 'my_object',
    description: 'Items, clothing, accessories, etc.' 
  }
];

const STYLE_PRESETS = [
  { name: 'Pure Hairy', prompt: 'Focus strictly on dense pubic hair, detailed strands, and natural curl. No shaving.' },
  { name: 'Realistic Skin', prompt: 'Highlight skin texture, pores, realism, and soft lighting. Avoid smoothed plastic looks.' },
  { name: 'Wet/Glistening', prompt: 'Emphasize wetness, labia glistening, and moisture details.' },
  { name: 'Anatomic Focus', prompt: 'Anatomically correct labels for labia minora/majora, coloration, and precise spread angles.' }
];

const MODELS = [
  { id: 'grok-4-1-fast', name: 'Grok 4.1 Fast' },
  { id: 'grok-2-vision-1212', name: 'Grok 2 Vision (1212)' },
  { id: 'grok-vision-beta', name: 'Grok Vision Beta' }
];

// --- Sub-components ---

export default function App() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('bcp_settings');
    if (saved) return JSON.parse(saved);
    return {
      apiKey: '',
      triggerWord: 'my_subject',
      systemPrompt: `You are an expert LoRA training captioner.\nWrite short, natural, consistent captions (15-35 words).\n\nRules:\n- Always focus only on repeatable features\n- Describe: pubic hair (density, thickness, curl, color), hands if spreading, labia (wetness, color), angle, skin texture\n- Prefer "wet" or "glistening" over "dry"\n- NEVER mention: watermarks, tattoos, jewelry (rings, necklaces), background details, skin blemishes, freckles, specific poses like "buttocks spread wide"\n- Keep language direct and simple. No flowery words.\n\nGood example:\nhairy pussy, hands spreading labia wide open, extremely dense thick curly dark pubic hair, detailed individual strands, wet glistening pink inner folds, close-up overhead view, realistic skin texture, soft even lighting`,
      model: 'grok-4-1-fast',
      temperature: 0.7,
      detail: 'high'
    };
  });
  const [availableModels, setAvailableModels] = useState<{id: string, name: string}[]>(MODELS);
  const [currentMode, setCurrentMode] = useState('bodypart');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [version] = useState("V1.4.2-STABLE");
  const processingAbortRef = useRef<boolean>(false);

  // Persistence: Save settings
  useEffect(() => {
    localStorage.setItem('bcp_settings', JSON.stringify(settings));
  }, [settings]);

  // Load from Persistence on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedCaptions = JSON.parse(localStorage.getItem('bcp_captions') || '{}');
        const savedIds = JSON.parse(localStorage.getItem('bcp_image_ids') || '[]');
        const imageList: ImageFile[] = [];

        for (const id of savedIds) {
          const fileData = await idbKeyval.get(`img_${id}`);
          if (fileData) {
            imageList.push({
              id,
              file: fileData as File,
              preview: URL.createObjectURL(fileData as File),
              caption: savedCaptions[(fileData as File).name] || '',
              status: savedCaptions[(fileData as File).name] ? 'done' : 'idle'
            });
          }
        }
        
        // Fallback: Check if there are keys in IDB not in localStorage list (unlikely but safe)
        const allKeys = await idbKeyval.keys();
        for (const key of allKeys) {
          if (typeof key === 'string' && key.startsWith('img_')) {
            const id = key.replace('img_', '');
            if (!savedIds.includes(id)) {
              const fileData = await idbKeyval.get(key);
              if (fileData) {
                imageList.push({
                  id,
                  file: fileData as File,
                  preview: URL.createObjectURL(fileData as File),
                  caption: savedCaptions[(fileData as File).name] || '',
                  status: savedCaptions[(fileData as File).name] ? 'done' : 'idle'
                });
              }
            }
          }
        }

        if (imageList.length > 0) {
          setImages(imageList);
        }
      } catch (err) {
        console.error("Failed to load persistent data:", err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  // Persistence: Save captions and IDS
  useEffect(() => {
    if (!isLoaded) return;
    
    const captionMap = images.reduce((acc, img) => {
      if (img.caption) acc[img.file.name] = img.caption;
      return acc;
    }, {} as Record<string, string>);
    localStorage.setItem('bcp_captions', JSON.stringify(captionMap));
    
    const imageIds = images.map(img => img.id);
    localStorage.setItem('bcp_image_ids', JSON.stringify(imageIds));
  }, [images, isLoaded]);

  // Fetch available models when API key changes
  useEffect(() => {
    if (settings.apiKey) {
      fetch('/api/models', {
        headers: { 'x-api-key': settings.apiKey }
      })
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          const visionModels = data.data
            .filter((m: any) => m.id.includes('vision') || m.id.includes('fast'))
            .map((m: any) => ({ id: m.id, name: m.id }));
          if (visionModels.length > 0) {
            setAvailableModels(visionModels);
            if (!visionModels.some((m: any) => m.id === settings.model)) {
                setSettings(s => ({ ...s, model: visionModels[0].id }));
            }
          }
        }
      })
      .catch(err => console.error("Failed to fetch models:", err));
    }
  }, [settings.apiKey]);

  const selectedImage = images.find(img => img.id === selectedImageId) || null;

  // File Upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const savedCaptions = JSON.parse(localStorage.getItem('bcp_captions') || '{}');
    
    const newImages: ImageFile[] = [];
    for (const file of acceptedFiles) {
      const id = Math.random().toString(36).substring(7);
      await idbKeyval.set(`img_${id}`, file); // Save to IDB
      newImages.push({
        id,
        file,
        preview: URL.createObjectURL(file),
        caption: savedCaptions[file.name] || '',
        status: (savedCaptions[file.name] ? 'done' : 'idle') as any
      });
    }

    setImages(prev => [...prev, ...newImages]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    },
    multiple: true
  } as any);

  // Cleanup previews
  useEffect(() => {
    return () => images.forEach(img => URL.revokeObjectURL(img.preview));
  }, [images]);

  // Auto-select first image if none selected
  useEffect(() => {
    if (images.length > 0 && !selectedImageId) {
      setSelectedImageId(images[0].id);
    }
  }, [images, selectedImageId]);

  // Captioning Logic
  const processImage = async (imgId: string) => {
    const img = images.find(i => i.id === imgId);
    if (!img) return;

    setImages(prev => prev.map(p => p.id === imgId ? { ...p, status: 'processing', error: undefined } : p));

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<{base64: string, type: string}>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({ base64, type: img.file.type });
        };
        reader.readAsDataURL(img.file);
      });
      const { base64: base64Image, type: mimeType } = await base64Promise;

      const response = await fetch('/api/caption', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey 
        },
        body: JSON.stringify({
          image: base64Image,
          mimeType: mimeType,
          systemPrompt: settings.systemPrompt,
          model: settings.model,
          temperature: settings.temperature,
          detail: settings.detail,
          triggerWord: settings.triggerWord 
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to caption');

      let captionText = data.caption.trim();

      // Remove duplicate trigger if Grok includes it
      if (captionText.toLowerCase().startsWith(settings.triggerWord.toLowerCase())) {
        captionText = captionText.replace(new RegExp(`^${settings.triggerWord}\\s*,?\\s*`, 'i'), '').trim();
      }

      const fullCaption = `${settings.triggerWord}, ${captionText}`;
      setImages(prev => prev.map(p => p.id === imgId ? { ...p, status: 'done', caption: fullCaption } : p));
    } catch (error: any) {
      setImages(prev => prev.map(p => p.id === imgId ? { ...p, status: 'error', error: error.message } : p));
    }
  };

  const processAll = async () => {
    const idleImages = images.filter(img => img.status === 'idle' || img.status === 'error');
    if (idleImages.length === 0) return;

    setIsProcessing(true);
    setIsPaused(false);
    setProcessedCount(0);
    processingAbortRef.current = false;

    for (let i = 0; i < idleImages.length; i++) {
      if (processingAbortRef.current) {
        setIsPaused(true);
        break;
      }
      await processImage(idleImages[i].id);
      setProcessedCount(i + 1);
    }
    
    if (!processingAbortRef.current) {
      setIsProcessing(false);
    }
  };

  const pauseProcessing = () => {
    processingAbortRef.current = true;
    setIsPaused(true);
  };

  const stopProcessing = () => {
    processingAbortRef.current = true;
    setIsProcessing(false);
    setIsPaused(false);
  };

  const removeImage = async (id: string) => {
    await idbKeyval.del(`img_${id}`);
    setImages(prev => prev.filter(img => img.id !== id));
    if (selectedImageId === id) setSelectedImageId(null);
  };

  const eraseAll = async () => {
    if (!confirm("Are you sure you want to erase all images and captions?")) return;
    await idbKeyval.clear();
    localStorage.removeItem('bcp_captions');
    localStorage.removeItem('bcp_image_ids');
    setImages([]);
    setSelectedImageId(null);
    setIsProcessing(false);
  };

  const downloadSingle = (img: ImageFile) => {
    const filename = img.file.name.replace(/\.[^/.]+$/, "") + ".txt";
    const blob = new Blob([img.caption || ""], { type: "text/plain;charset=utf-8" });
    saveAs(blob, filename);
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    images.forEach(img => {
      const filename = img.file.name.replace(/\.[^/.]+$/, "") + ".txt";
      zip.file(filename, img.caption || "");
    });
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "captions.zip");
  };

  return (
    <div className="flex flex-col h-screen bg-[#050506] text-slate-200 font-sans overflow-hidden">
      
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-[#0a0a0c] border-b border-white/5 shadow-2xl relative z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.5)]">
            <ImageIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 uppercase">
            EASY-CAP
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className={cn(
              "p-2 rounded-md border border-white/10 transition-all",
              isSidebarOpen ? "bg-indigo-600 text-white border-indigo-500" : "bg-white/5 text-slate-400 hover:bg-white/10"
            )}
          >
            <Settings className="w-4 h-4" />
          </button>
          
          <div {...getRootProps()}>
            <input {...getInputProps()} />
            <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-md border border-white/10 text-[11px] font-bold uppercase tracking-wider transition-all">
              Add Images
            </button>
          </div>

          <button 
            onClick={eraseAll}
            disabled={images.length === 0}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Erase All
          </button>

          {isProcessing ? (
            <button 
              onClick={isPaused ? processAll : pauseProcessing}
              className={cn(
                "px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider shadow-lg transition-all flex items-center gap-2",
                isPaused ? "bg-amber-600 hover:bg-amber-500 text-white" : "bg-white/10 text-white border border-white/10"
              )}
            >
              {isPaused ? <Zap className="w-3.5 h-3.5 fill-current" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          ) : (
            <button 
              onClick={processAll}
              disabled={!settings.apiKey || images.length === 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-slate-600 rounded-md text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-indigo-900/40 transition-all flex items-center gap-2"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              Process All
            </button>
          )}

          {isProcessing && (
            <button 
              onClick={stopProcessing}
              className="p-2 bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors"
              title="Stop Processing"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button 
            onClick={downloadAll}
            disabled={images.length === 0}
            className="px-4 py-2 bg-white text-black hover:bg-slate-200 disabled:bg-white/5 disabled:text-slate-600 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            Save All
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Sidebar: Configuration */}
        <AnimatePresence initial={false}>
          {isSidebarOpen && (
            <form onSubmit={(e) => e.preventDefault()} className="bg-[#0a0a0c] border-r border-white/5 flex flex-col p-5 overflow-hidden shrink-0">
              <div className="mb-6">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 block">Vision Engine</label>
                <select 
                  className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm text-slate-300 outline-none focus:border-indigo-500 cursor-pointer appearance-none"
                  value={settings.model}
                  onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
                >
                  {availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              <div className="mb-6">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 block">Trigger Word</label>
                <input 
                  type="text" 
                  value={settings.triggerWord}
                  onChange={e => setSettings(s => ({ ...s, triggerWord: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm text-indigo-400 outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="mb-6">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 block">Caption Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {CAPTION_MODES.map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setCurrentMode(mode.id);
                        setSettings(s => ({ 
                          ...s, 
                          triggerWord: mode.defaultTrigger 
                        }));
                      }}
                      className={cn(
                        "py-2 px-1 rounded text-[10px] font-bold uppercase transition-all border",
                        currentMode === mode.id 
                          ? "bg-indigo-600 border-indigo-500 text-white" 
                          : "bg-black/40 border-white/10 hover:border-white/30 text-slate-500"
                      )}
                    >
                      {mode.name}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-500 mt-2 italic leading-tight">
                  {CAPTION_MODES.find(m => m.id === currentMode)?.description}
                </p>
              </div>

              <div className="mb-6 flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">System Prompt</label>
                  <div className="group relative">
                    <button className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold transition-all uppercase flex items-center gap-1">
                      <Sliders className="w-3 h-3" /> Presets
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#121214] border border-white/10 rounded-lg shadow-2xl p-2 z-50 hidden group-hover:block">
                      <div className="text-[9px] uppercase text-slate-500 font-bold px-2 py-1 border-b border-white/5 mb-1">Apply Tag Preference</div>
                      {STYLE_PRESETS.map(preset => (
                        <button
                          key={preset.name}
                          onClick={() => {
                            const newPrompt = `You are an expert LoRA training captioner. ${preset.prompt}\n\nRules:\n- Always focus only on repeatable features... (Standard rules applied)`;
                            setSettings(s => ({ ...s, systemPrompt: preset.prompt }));
                          }}
                          className="w-full text-left px-2 py-1.5 text-[10px] text-slate-400 hover:bg-indigo-600/20 hover:text-indigo-400 rounded transition-colors"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <textarea 
                  className="w-full flex-1 bg-black/40 border border-white/10 rounded p-2 text-xs text-slate-400 resize-none leading-relaxed focus:border-indigo-500 outline-none custom-scrollbar"
                  value={settings.systemPrompt}
                  onChange={e => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                />
              </div>

              <div className="space-y-4 mb-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase">
                    <span className="text-slate-500 font-bold tracking-widest">Temperature</span>
                    <span className="text-indigo-400 font-mono">{settings.temperature}</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1"
                    className="w-full accent-indigo-500 h-1 bg-white/5 rounded-full appearance-none cursor-pointer"
                    value={settings.temperature}
                    onChange={e => setSettings(s => ({ ...s, temperature: parseFloat(e.target.value) }))}
                  />
                </div>
                <div>
                   <div className="flex justify-between text-[10px] uppercase mb-2">
                    <span className="text-slate-500 font-bold tracking-widest">Detail Level</span>
                    <span className="text-indigo-400 uppercase">{settings.detail}</span>
                  </div>
                  <div className="flex gap-1">
                    {['low', 'high', 'auto'].map(d => (
                      <button
                        key={d}
                        onClick={() => setSettings(s => ({ ...s, detail: d as any }))}
                        className={cn(
                          "flex-1 py-1 rounded text-[10px] font-bold uppercase border transition-all",
                          settings.detail === d 
                            ? "bg-indigo-600/10 border-indigo-500/50 text-indigo-400" 
                            : "bg-black/40 border-white/5 text-slate-600 hover:border-white/10"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t border-white/5 space-y-3">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">API Key</label>
                  <input 
                    type="password"
                    placeholder="Enter Grok Key..."
                    className="w-full bg-black/40 border border-white/10 rounded p-2 text-xs text-slate-300 outline-none focus:border-indigo-500"
                    value={settings.apiKey}
                    onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))}
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-indigo-500/5 border border-indigo-500/10">
                  <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">Engine Status</span>
                  <span className={cn(
                    "flex h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]",
                    settings.apiKey ? "bg-emerald-500 text-emerald-500" : "bg-red-500 text-red-500"
                  )}></span>
                </div>
              </div>
            </form>
          )}
        </AnimatePresence>

        {/* Central Content: Batch Grid */}
        <section className="flex-1 bg-black p-4 overflow-y-auto scrollbar-hide">
          {images.length === 0 ? (
             <div 
                {...getRootProps()} 
                className={cn(
                  "h-full rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group",
                  isDragActive ? "bg-indigo-500/5 border-indigo-500/50" : "hover:bg-white/5 hover:border-white/20"
                )}
              >
                <input {...getInputProps()} />
                <div className="w-16 h-16 rounded-2xl bg-[#0a0a0c] border border-white/5 flex items-center justify-center group-hover:scale-110 transition-transform shadow-2xl">
                  <Upload className={cn("w-6 h-6", isDragActive ? "text-indigo-400 animate-pulse" : "text-slate-600")} />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Import your dataset</h3>
                  <p className="text-[11px] text-slate-600 uppercase tracking-wider mt-1">Drag and drop or browse files</p>
                </div>
             </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
              <AnimatePresence>
                {images.map((img) => (
                  <motion.div 
                    layout
                    key={img.id}
                    onClick={() => setSelectedImageId(img.id)}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "relative bg-[#0e0e11] rounded-lg border p-1 group cursor-pointer transition-all",
                      selectedImageId === img.id ? "border-indigo-500/50 shadow-[0_0_20px_rgba(79,70,229,0.1)]" : "border-white/5 hover:border-white/20"
                    )}
                  >
                    <div className="aspect-square rounded overflow-hidden mb-2 relative bg-black">
                      <img src={img.preview} alt="preview" className="w-full h-full object-cover" />
                      
                      {/* Badge */}
                      <div className="absolute top-1 right-1 flex gap-1">
                        {img.status === 'processing' && (
                          <div className="bg-indigo-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase flex items-center gap-1">
                            <Loader2 className="w-2 h-2 animate-spin" /> ...
                          </div>
                        )}
                        {img.status === 'done' && (
                          <div className="bg-emerald-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">READY</div>
                        )}
                        {img.status === 'error' && (
                          <div className="bg-red-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">FAIL</div>
                        )}
                      </div>

                      {/* Hover Actions */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); processImage(img.id); }}
                          className="p-1.5 bg-white/10 hover:bg-white/20 rounded-md text-white transition-colors"
                          title="Generate Caption"
                        >
                          <Zap className="w-4 h-4 fill-current" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); downloadSingle(img); }}
                          className="p-1.5 bg-white/10 hover:bg-white/20 rounded-md text-emerald-400 transition-colors"
                          title="Download Caption"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                          className="p-1.5 bg-red-500/20 hover:bg-red-500 text-red-200 rounded-md transition-colors"
                          title="Remove Image"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="px-1 pb-1">
                      <div className="text-[9px] text-slate-500 font-mono truncate mb-0.5">{img.file.name}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-2 leading-tight min-h-[2.5em]">
                        {img.caption || (img.status === 'error' ? img.error : 'Awaiting generation...')}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {/* Quick Add Card */}
              <div 
                {...getRootProps()}
                className="bg-[#0e0e11]/50 border border-dashed border-white/5 rounded-lg flex flex-col items-center justify-center py-8 group hover:border-indigo-500/30 hover:bg-indigo-500/5 cursor-pointer transition-all"
              >
                <input {...getInputProps()} />
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-600 group-hover:text-indigo-400 transition-colors">
                  <Upload className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Panel: Editor/Inspector */}
        <aside className="w-80 bg-[#0a0a0c] border-l border-white/5 flex flex-col shrink-0">
          <div className="p-5 flex-1 flex flex-col overflow-hidden">
            <div className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold mb-4 flex items-center gap-2">
              <span className="w-1 h-3 bg-indigo-500"></span> Image Inspector
            </div>
            
            {selectedImage ? (
              <div className="flex-1 flex flex-col">
                <div className="w-full aspect-[4/5] rounded-xl bg-black mb-6 overflow-hidden border border-white/10 shadow-2xl relative group">
                  <img src={selectedImage.preview} className="w-full h-full object-contain" alt="selected preview" />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-md p-2 text-[9px] font-mono text-slate-400 text-center uppercase tracking-widest">
                    {selectedImage.file.name.slice(0, 30)}
                  </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Generated Caption</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => downloadSingle(selectedImage)}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 uppercase transition-colors"
                      >
                        <Download className="w-3 h-3" /> Save
                      </button>
                      <button 
                        onClick={() => processImage(selectedImage.id)}
                        disabled={selectedImage.status === 'processing'}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 uppercase transition-colors"
                      >
                        <Zap className="w-3 h-3 fill-current" /> Regen
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 relative overflow-hidden">
                    <textarea 
                      className="w-full h-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-slate-200 leading-relaxed font-mono resize-none focus:ring-1 focus:ring-indigo-500 outline-none custom-scrollbar"
                      value={selectedImage.caption}
                      onChange={(e) => setImages(prev => prev.map(p => p.id === selectedImage.id ? { ...p, caption: e.target.value } : p))}
                      placeholder="Caption will appear here..."
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setSelectedImageId(prev => {
                        const idx = images.findIndex(i => i.id === prev);
                        if (idx > 0) return images[idx-1].id;
                        return prev;
                      })}
                      className="py-2 bg-white/5 border border-white/10 rounded font-bold text-[10px] uppercase tracking-widest hover:bg-white/10 transition-colors"
                    >
                      Prev
                    </button>
                    <button 
                      onClick={() => setSelectedImageId(prev => {
                        const idx = images.findIndex(i => i.id === prev);
                        if (idx < images.length - 1) return images[idx+1].id;
                        return prev;
                      })}
                      className="py-2 bg-indigo-600 rounded font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-900/40 hover:bg-indigo-500 transition-colors"
                    >
                      Next Image
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-600 uppercase tracking-widest text-[10px] gap-2">
                <AlertCircle className="w-6 h-6 opacity-20" />
                Select an image to inspect
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Footer Status Bar */}
      <footer className="h-8 bg-[#0a0a0c] border-t border-white/5 px-6 flex items-center justify-between text-[10px] text-slate-500 font-medium tracking-wide shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-indigo-500">●</span> 
            {images.length} IMAGES LOADED
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 uppercase">●</span> 
            ENGINE: {settings.model.toUpperCase()}
          </div>
          {isProcessing && (
            <div className="flex items-center gap-2 text-indigo-400 font-bold">
              <span className="animate-pulse">●</span>
              PROCESSING: {processedCount} / {images.filter(img => img.status === 'idle' || img.status === 'error' || img.status === 'processing').length + processedCount}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="px-2 py-0.5 rounded bg-white/5 border border-white/5 uppercase">
            STATUS: {settings.apiKey ? 'READY' : 'KEY MISSING'}
          </div>
          <div className="uppercase opacity-50">{version}</div>
        </div>
      </footer>
    </div>
  );
}

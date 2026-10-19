/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, Sparkles, Key, History, BookOpen, Play, Download, 
  Trash2, Copy, Check, Plus, Loader2, Film, Clock, 
  Maximize2, Cpu, Zap, Shield, ChevronRight, AlertCircle, RefreshCw, Send
} from 'lucide-react';

interface VideoJob {
  id: string;
  prompt: string;
  model: 'fast' | 'mini';
  duration: number;
  ratio: string;
  videoUrl?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  createdAt: string;
}

interface ApiKeyItem {
  key: string;
  name: string;
  createdAt: string;
  requestsCount: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'generator' | 'gallery' | 'keys' | 'docs'>('generator');
  
  // Generator state
  const [prompt, setPrompt] = useState('A cinematic drone shot of a snowy mountain at sunrise, warm sun rays hitting the peaks');
  const [model, setModel] = useState<'fast' | 'mini'>('fast');
  const [duration, setDuration] = useState<number>(4);
  const [ratio, setRatio] = useState<string>('16:9');
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);

  // References
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const audInputRef = useRef<HTMLInputElement>(null);
  const [refImages, setRefImages] = useState<File[]>([]);
  const [refVideos, setRefVideos] = useState<File[]>([]);
  const [refAudios, setRefAudios] = useState<File[]>([]);

  // Generation process state
  const [generating, setGenerating] = useState<boolean>(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [completedVideo, setCompletedVideo] = useState<{ url: string; id: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Gallery state
  const [videos, setVideos] = useState<VideoJob[]>([]);

  // New key modal state
  const [newKeyName, setNewKeyName] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
    fetchVideos();
  }, []);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/v1/keys');
      const data = await res.json();
      if (data.keys) {
        setApiKeys(data.keys);
        if (!selectedKey && data.keys.length > 0) {
          setSelectedKey(data.keys[0].key);
        }
      }
    } catch (e) {
      console.error("Failed to fetch keys", e);
    }
  };

  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/v1/videos');
      const data = await res.json();
      if (data.videos) {
        setVideos(data.videos);
      }
    } catch (e) {
      console.error("Failed to fetch videos", e);
    }
  };

  const uploadRefFile = async (file: File) => {
    const fd = new FormData();
    fd.append("k", "ae4f5b0c9d");
    fd.append("files[]", file, file.name);
    const r = await fetch("/proxy/uguu/", { method: "POST", body: fd });
    if(!r.ok) throw new Error("Не удалось загрузить файл " + file.name);
    const j = await r.json();
    const url = j.files && j.files[0] && j.files[0].url;
    if(!url) throw new Error("Не удалось получить URL файла " + file.name);
    return url;
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setErrorMsg('Пожалуйста, введите промт для генерации видео');
      return;
    }

    setGenerating(true);
    setErrorMsg(null);
    setCompletedVideo(null);
    setProgressMessage('Загрузка референсов и подготовка задания...');

    try {
      // 1. Upload references if any
      const refs: { url: string; type: string; role: string }[] = [];
      
      for (const f of refImages) {
        const url = await uploadRefFile(f);
        refs.push({ url, type: 'image', role: 'reference_image' });
      }
      for (const f of refVideos) {
        const url = await uploadRefFile(f);
        refs.push({ url, type: 'video', role: 'reference_video' });
      }
      for (const f of refAudios) {
        const url = await uploadRefFile(f);
        refs.push({ url, type: 'audio', role: 'reference_audio' });
      }

      setProgressMessage(`Запуск нейросети (${model === 'fast' ? 'Fast' : 'Mini / SD2'})...`);

      // 2. Start generation via local API proxy
      const isFast = model === 'fast';
      const runRes = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: selectedKey,
          prompt,
          duration: Number(duration),
          ratio,
          fast: isFast,
          refs
        })
      });

      const runData = await runRes.json();
      if (!runRes.ok || !runData.job) {
        throw new Error(runData.error || 'Ошибка запуска генерации');
      }

      const jobId = runData.job;
      setCurrentJobId(jobId);
      setProgressMessage('Видео генерируется в облаке (это может занять от 30 секунд до 2 минут)...');

      // 3. Poll for status
      const deadline = Date.now() + 25 * 60 * 1000;
      let videoUrl: string | null = null;

      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 4000));
        const statusRes = await fetch(`/api/status?id=${jobId}`);
        const statusData = await statusRes.json();

        if (statusData.state === 'done') {
          videoUrl = statusData.url;
          break;
        } else if (statusData.state === 'error') {
          throw new Error(statusData.message || 'Ошибка во время генерации видео');
        } else {
          setProgressMessage('Отрендерено кадров, обработка продолжается...');
        }
      }

      if (!videoUrl) {
        throw new Error('Превышено время ожидания генерации (таймаут)');
      }

      setCompletedVideo({ url: videoUrl, id: jobId });
      fetchVideos();
      setActiveTab('gallery');
    } catch (err: any) {
      setErrorMsg(err.message || 'Произошла непредвиденная ошибка');
    } finally {
      setGenerating(false);
      setCurrentJobId(null);
      setProgressMessage('');
    }
  };

  const enhancePromptWithGemini = async () => {
    if (!prompt.trim()) return;
    setIsEnhancing(true);
    try {
      const res = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style: 'Cinematic, 4k, hyper-detailed' })
      });
      const data = await res.json();
      if (data.enhanced) {
        setPrompt(data.enhanced);
      }
    } catch (e) {
      console.error("Gemini enhance error", e);
    } finally {
      setIsEnhancing(false);
    }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName })
      });
      const data = await res.json();
      if (data.key) {
        setNewKeyName('');
        fetchKeys();
        setSelectedKey(data.key);
      }
    } catch (e) {
      console.error("Failed to create API key", e);
    }
  };

  const deleteApiKey = async (keyToDelete: string) => {
    try {
      await fetch(`/api/v1/keys/${encodeURIComponent(keyToDelete)}`, {
        method: 'DELETE'
      });
      fetchKeys();
    } catch (e) {
      console.error("Failed to delete key", e);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#070b19] text-[#e2e8f0] font-sans antialiased selection:bg-indigo-600 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-[#0b1021]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('generator')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                CinematicAI Studio
              </span>
              <span className="text-xs block text-slate-400">Next-Gen Video Generation</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-1 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('generator')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'generator'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Генератор</span>
            </button>
            <button
              onClick={() => setActiveTab('gallery')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'gallery'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Галерея ({videos.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('keys')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'keys'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>API Ключи</span>
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'docs'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Документация</span>
            </button>
          </nav>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-slate-300 font-mono">API: Активно</span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Nav */}
      <div className="md:hidden flex border-b border-slate-800 bg-slate-900 px-2 py-2 overflow-x-auto space-x-2">
        <button onClick={() => setActiveTab('generator')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${activeTab === 'generator' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Генератор</button>
        <button onClick={() => setActiveTab('gallery')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${activeTab === 'gallery' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Галерея</button>
        <button onClick={() => setActiveTab('keys')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${activeTab === 'keys' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>API Ключи</button>
        <button onClick={() => setActiveTab('docs')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${activeTab === 'docs' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Документация</button>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* TAB 1: GENERATOR */}
        {activeTab === 'generator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left/Main Column: Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#111831] border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none"></div>

                <h2 className="text-xl font-bold text-white mb-2 flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  <span>Создание кинематографического видео</span>
                </h2>
                <p className="text-sm text-slate-400 mb-6">
                  Выберите модель генерации, настройте параметры и опишите желаемую сцену.
                </p>

                <form onSubmit={handleGenerate} className="space-y-6">
                  
                  {/* Model Selection (Fast vs Mini) */}
                  <div>
                    <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2">
                      Модель нейросети
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div
                        onClick={() => setModel('fast')}
                        className={`cursor-pointer border rounded-xl p-4 transition-all flex items-start space-x-3 ${
                          model === 'fast'
                            ? 'bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30'
                            : 'bg-[#0d142d] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="model_selector"
                          checked={model === 'fast'}
                          onChange={() => setModel('fast')}
                          className="mt-1 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-semibold text-white flex items-center space-x-2">
                            <span>Fast Model</span>
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">Fast Toggle</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Максимальная скорость рендеринга для быстрых итераций и динамичных роликов.
                          </p>
                        </div>
                      </div>

                      <div
                        onClick={() => setModel('mini')}
                        className={`cursor-pointer border rounded-xl p-4 transition-all flex items-start space-x-3 ${
                          model === 'mini'
                            ? 'bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30'
                            : 'bg-[#0d142d] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="model_selector"
                          checked={model === 'mini'}
                          onChange={() => setModel('mini')}
                          className="mt-1 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-semibold text-white flex items-center space-x-2">
                            <span>Mini (SD 2)</span>
                            <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-mono">Mini Toggle</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Повышенная детализация и глубокое качество текстур по алгоритму Stable Diffusion 2.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* API Key Selector */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                        API Ключ авторизации
                      </label>
                      <button
                        type="button"
                        onClick={() => setActiveTab('keys')}
                        className="text-xs text-indigo-400 hover:underline flex items-center space-x-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Создать новый ключ</span>
                      </button>
                    </div>
                    <select
                      value={selectedKey}
                      onChange={(e) => setSelectedKey(e.target.value)}
                      className="w-full bg-[#0a1025] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      {apiKeys.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.name} ({k.key.substring(0, 12)}...)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Prompt Textarea */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                        Промпт (Описание сцены)
                      </label>
                      <button
                        type="button"
                        onClick={enhancePromptWithGemini}
                        disabled={isEnhancing}
                        className="text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-3 py-1 rounded-lg flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
                      >
                        {isEnhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Улучшить с Gemini</span>
                      </button>
                    </div>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      className="w-full bg-[#0a1025] border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-y"
                      placeholder="Опишите детально то, что должно происходить в видео..."
                    />
                  </div>

                  {/* Options row: Duration & Ratio */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1.5">
                        Длительность: <span className="text-white font-mono">{duration} сек</span>
                      </label>
                      <input
                        type="range"
                        min="4"
                        max="15"
                        step="1"
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        className="w-full accent-indigo-600 bg-slate-800 rounded-lg h-2 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                        <span>4 сек (Быстро)</span>
                        <span>15 сек (Макс)</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1.5">
                        Формат (Соотношение сторон)
                      </label>
                      <select
                        value={ratio}
                        onChange={(e) => setRatio(e.target.value)}
                        className="w-full bg-[#0a1025] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="16:9">16:9 (Горизонтальное / YouTube)</option>
                        <option value="9:16">9:16 (Вертикальное / Reels / Shorts)</option>
                        <option value="1:1">1:1 (Квадратное / Instagram)</option>
                      </select>
                    </div>
                  </div>

                  {/* Reference Files Uploads */}
                  <div className="border-t border-slate-800/80 pt-4">
                    <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">
                      Референсы и исходные материалы (опционально)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <input
                          type="file"
                          ref={imgInputRef}
                          onChange={(e) => e.target.files && setRefImages(Array.from(e.target.files))}
                          accept="image/*"
                          multiple
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => imgInputRef.current?.click()}
                          className="w-full py-2.5 px-3 bg-[#0a1025] hover:bg-slate-800/60 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-center space-x-2 transition-all"
                        >
                          <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Фото ({refImages.length})</span>
                        </button>
                      </div>

                      <div>
                        <input
                          type="file"
                          ref={vidInputRef}
                          onChange={(e) => e.target.files && setRefVideos(Array.from(e.target.files))}
                          accept="video/*"
                          multiple
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => vidInputRef.current?.click()}
                          className="w-full py-2.5 px-3 bg-[#0a1025] hover:bg-slate-800/60 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-center space-x-2 transition-all"
                        >
                          <Film className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Видео ({refVideos.length})</span>
                        </button>
                      </div>

                      <div>
                        <input
                          type="file"
                          ref={audInputRef}
                          onChange={(e) => e.target.files && setRefAudios(Array.from(e.target.files))}
                          accept="audio/*"
                          multiple
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => audInputRef.current?.click()}
                          className="w-full py-2.5 px-3 bg-[#0a1025] hover:bg-slate-800/60 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center justify-center space-x-2 transition-all"
                        >
                          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Аудио ({refAudios.length})</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {errorMsg && (
                    <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 text-sm text-red-300 flex items-center space-x-3">
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={generating}
                    className="w-full py-4 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Генерация видео…</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 fill-current" />
                        <span>Сгенерировать видео ({model === 'fast' ? 'Fast' : 'Mini'})</span>
                      </>
                    )}
                  </button>

                </form>
              </div>
            </div>

            {/* Right Column: Live Status / Preview */}
            <div className="space-y-6">
              <div className="bg-[#111831] border border-slate-800/80 rounded-2xl p-6 shadow-xl sticky top-24">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                  <span>Статус рендеринга</span>
                </h3>

                {generating ? (
                  <div className="text-center py-12 space-y-4">
                    <div className="relative w-16 h-16 mx-auto">
                      <div className="absolute inset-0 rounded-full border-4 border-indigo-600/20"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Нейросеть в работе</h4>
                      <p className="text-xs text-slate-400 mt-1">{progressMessage}</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-3 text-xs text-slate-400 font-mono">
                      ID задачи: {currentJobId || 'создание...'}
                    </div>
                  </div>
                ) : completedVideo ? (
                  <div className="space-y-4">
                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-black">
                      <video controls autoPlay src={completedVideo.url} className="w-full aspect-video object-contain" />
                    </div>
                    <div className="flex space-x-2">
                      <a
                        href={completedVideo.url}
                        target="_blank"
                        download
                        className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all"
                      >
                        <Download className="w-4 h-4" />
                        <span>Скачать видео</span>
                      </a>
                      <button
                        onClick={() => setCompletedVideo(null)}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
                      >
                        Новое
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center mx-auto text-slate-500">
                      <Film className="w-6 h-6" />
                    </div>
                    <div className="text-sm text-slate-400">
                      Здесь появится готовое видео после завершения генерации.
                    </div>
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-slate-800/80 space-y-3 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Выбранная модель:</span>
                    <span className="text-white font-semibold uppercase">{model}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Длительность:</span>
                    <span className="text-white font-semibold">{duration} сек</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Формат:</span>
                    <span className="text-white font-semibold">{ratio}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GALLERY */}
        {activeTab === 'gallery' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">Галерея сгенерированных видео</h2>
                <p className="text-sm text-slate-400">История всех ваших созданных роликов.</p>
              </div>
              <button
                onClick={fetchVideos}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Обновить</span>
              </button>
            </div>

            {videos.length === 0 ? (
              <div className="text-center py-20 bg-[#111831] border border-slate-800 rounded-2xl space-y-4">
                <Film className="w-12 h-12 text-slate-600 mx-auto" />
                <div className="text-slate-400">У вас пока нет сгенерированных видео.</div>
                <button
                  onClick={() => setActiveTab('generator')}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
                >
                  Создать первое видео
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {videos.map((vid) => (
                  <div key={vid.id} className="bg-[#111831] border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
                    <div className="aspect-video bg-black relative flex items-center justify-center">
                      {vid.videoUrl ? (
                        <video controls src={vid.videoUrl} className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center p-4 space-y-2">
                          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
                          <span className="text-xs text-slate-400">Генерация в процессе...</span>
                        </div>
                      )}
                      <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase text-indigo-300 border border-slate-700">
                        {vid.model} • {vid.ratio} • {vid.duration}s
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <p className="text-sm text-slate-200 line-clamp-2">{vid.prompt}</p>
                      <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
                        <span>{new Date(vid.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {vid.videoUrl && (
                          <a
                            href={vid.videoUrl}
                            target="_blank"
                            download
                            className="text-indigo-400 hover:underline flex items-center space-x-1 font-semibold"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Скачать</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: API KEYS */}
        {activeTab === 'keys' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-white">Управление API ключами</h2>
              <p className="text-sm text-slate-400">Создавайте персональные ключи для доступа к REST API генерации видео.</p>
            </div>

            <div className="bg-[#111831] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-white">Создать новый API ключ</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Название ключа (например: Продакшн бот)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="flex-1 bg-[#0a1025] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={createApiKey}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center space-x-2 transition-all shadow-lg shadow-indigo-600/30"
                >
                  <Plus className="w-4 h-4" />
                  <span>Создать</span>
                </button>
              </div>
            </div>

            <div className="bg-[#111831] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-white">Ваши активные ключи</h3>
              <div className="divide-y divide-slate-800">
                {apiKeys.map((k) => (
                  <div key={k.key} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0">
                    <div>
                      <div className="font-semibold text-white flex items-center space-x-2">
                        <span>{k.name}</span>
                        <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
                          {k.requestsCount} запросов
                        </span>
                      </div>
                      <div className="font-mono text-xs text-slate-400 mt-1 select-all">{k.key}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(k.key, k.key)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center space-x-1.5 transition-all"
                      >
                        {copiedKey === k.key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === k.key ? 'Скопировано' : 'Копировать'}</span>
                      </button>
                      {k.key !== "sk-proj-9f2c7a41d8b3e6f5c0a1b2d3e4f5a6b7" && (
                        <button
                          onClick={() => deleteApiKey(k.key)}
                          className="p-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 rounded-lg transition-all"
                          title="Удалить ключ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DOCS & PLAYGROUND */}
        {activeTab === 'docs' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-white">Документация REST API</h2>
              <p className="text-sm text-slate-400">Интегрируйте генерацию видео в свои приложения по нашему API.</p>
            </div>

            <div className="bg-[#111831] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-lg font-semibold text-white">Эндпоинт генерации</h3>
              <div className="bg-black p-4 rounded-xl font-mono text-xs text-indigo-300 overflow-x-auto">
                POST /api/v1/generate
              </div>
              <p className="text-sm text-slate-300">
                Отправьте JSON запрос с заголовком <code className="text-indigo-400 font-mono">Authorization: Bearer YOUR_API_KEY</code>.
              </p>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Пример запроса на cURL:</span>
                <pre className="bg-black p-4 rounded-xl font-mono text-xs text-slate-300 overflow-x-auto">
{`curl -X POST ${window.location.origin}/api/v1/generate \\
  -H "Authorization: Bearer sk-cinematic-your-key-here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Cinematic shot of cyberpunk neon city in rain",
    "model": "fast",
    "duration": 5,
    "ratio": "16:9"
  }'`}
                </pre>
              </div>

              <div className="space-y-2 pt-4">
                <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Пример ответа:</span>
                <pre className="bg-black p-4 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto">
{`{
  "success": true,
  "job_id": "job_9a8b7c6d5e",
  "status": "processing",
  "message": "Video generation started successfully. Poll /api/v1/videos/:id for status."
}`}
                </pre>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

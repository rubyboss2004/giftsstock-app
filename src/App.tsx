import React, { useState, useEffect } from 'react';
import emailjs from '@emailjs/browser';
import { db } from './firebase';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, updateDoc, deleteDoc, doc, getDocs, where } from 'firebase/firestore';
import { AppSystem, InventoryItem, ExchangeRecord } from './types';
import { Package, History, PlusCircle, ArrowLeftRight, LogOut, Menu, X, Loader2, Gift, Coins, ChevronDown, ChevronRight, Camera, CheckCircle2, UserCheck, Image as ImageIcon, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthContext';
import { format } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

async function syncToGoogleSheets(system: AppSystem, itemId: string, quantity: number, handler: string, date: string) {
  try {
    const q = query(collection(db, 'settings'));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    
    const settings = snapshot.docs[0].data();
    const spreadsheetId = settings.googleSheetsId;
    const sheetName = system === 'birthday' ? settings.birthdaySheetName : settings.pointsSheetName;
    
    if (!spreadsheetId || !sheetName) return;

    const res = await fetch('/api/sheets/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId,
        sheetName,
        itemId,
        quantity,
        handler,
        date,
        system
      })
    });
    
    if (!res.ok) {
      const error = await res.json();
      console.error('Sheets sync failed:', error);
    }
  } catch (e) {
    console.error('Sheets sync error:', e);
  }
}

export default function App() {
  const { isAuthenticated, loading, role, login, logout } = useAuth();
  const [system, setSystem] = useState<AppSystem>('birthday');
  const [activeTab, setActiveTab] = useState<'home' | 'inventory' | 'exchange' | 'input' | 'history' | 'coordinator'>('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCoordinatorAuthenticated, setIsCoordinatorAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [isSystemSelected, setIsSystemSelected] = useState(false);

  // Reset tab when switching systems
  useEffect(() => {
    setActiveTab('home');
  }, [system]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      const success = await login(password);
      if (!success) {
        toast.error('密碼錯誤');
      }
    };

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 rounded-3xl bg-white p-8 shadow-sm border border-stone-100"
        >
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-white">
              <Package className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-stone-900">庫存管理系統</h1>
            <p className="mt-2 text-stone-500">請輸入存取密碼</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition-all focus:border-stone-900 focus:bg-white"
              autoFocus
            />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
            >
              登入
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (!isSystemSelected) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans">
        <Toaster position="top-center" />
        <SystemSelectionView onSelect={(sys) => {
          setSystem(sys);
          setIsSystemSelected(true);
        }} />
      </div>
    );
  }

  const tabs = [
    { id: 'inventory', label: '總庫存', icon: Package },
    { id: 'exchange', label: system === 'birthday' ? '兌換紀錄' : '申請兌換', icon: system === 'birthday' ? ArrowLeftRight : Camera },
    { id: 'input', label: '庫存輸入', icon: PlusCircle },
    { id: 'history', label: '歷史紀錄', icon: History },
    ...(system === 'points' ? [{ id: 'coordinator', label: '統整審核', icon: UserCheck }] : []),
    { id: 'settings', label: '系統設定', icon: Menu },
  ] as const;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      <Toaster position="top-center" />
      
      {/* Mobile Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/80 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          {system === 'birthday' ? <Gift className="h-6 w-6 text-stone-900" /> : <Coins className="h-6 w-6 text-stone-900" />}
          <span className="font-semibold tracking-tight">{system === 'birthday' ? '生日禮物系統' : '換點數系統'}</span>
        </div>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="rounded-lg p-1 hover:bg-stone-100">
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      <div className="flex">
        {/* Sidebar / Navigation */}
        <nav className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-stone-200 bg-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="flex h-full flex-col p-4">
            <div className="mb-6 px-2">
              <div className="flex items-center gap-3 mb-6 lg:flex cursor-pointer" onClick={() => setIsSystemSelected(false)}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-white">
                  {system === 'birthday' ? <Gift className="h-6 w-6" /> : <Coins className="h-6 w-6" />}
                </div>
                <span className="text-xl font-bold tracking-tight">庫存管理</span>
              </div>
              
              {/* System Switcher */}
              <div className="flex rounded-xl bg-stone-100 p-1">
                <button 
                  onClick={() => setSystem('birthday')}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-xs font-bold transition-all",
                    system === 'birthday' ? "bg-white text-stone-900 shadow-sm" : "text-stone-400 hover:text-stone-600"
                  )}
                >
                  生日禮物
                </button>
                <button 
                  onClick={() => setSystem('points')}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-xs font-bold transition-all",
                    system === 'points' ? "bg-white text-stone-900 shadow-sm" : "text-stone-400 hover:text-stone-600"
                  )}
                >
                  換點數
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setIsMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    activeTab === tab.id 
                      ? "bg-stone-900 text-white shadow-md" 
                      : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                  )}
                >
                  <tab.icon className="h-5 w-5" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-auto border-t border-stone-100 pt-4">
              <div className="flex items-center justify-between gap-3 px-2 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
                    <Package className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-stone-900">{role === 'admin' ? '管理員模式' : '工作人員模式'}</span>
                </div>
                <button onClick={logout} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-4xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'home' && (
                  <HomeView system={system} onNavigate={(tab) => setActiveTab(tab as any)} />
                )}
                {activeTab === 'inventory' && <InventoryView system={system} />}
                {activeTab === 'exchange' && (system === 'birthday' ? <ExchangeForm /> : <PointsExchangeRequest />)}
                {activeTab === 'input' && <InventoryInputView system={system} />}
                {activeTab === 'history' && <HistoryView system={system} />}
                {activeTab === 'settings' && <SettingsView system={system} />}
                {activeTab === 'coordinator' && system === 'points' && (
                  isCoordinatorAuthenticated ? (
                    <CoordinatorView />
                  ) : (
                    <CoordinatorLogin onAuthenticated={() => setIsCoordinatorAuthenticated(true)} />
                  )
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Overlay for mobile menu */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-30 bg-stone-900/20 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </div>
  );
}

function SystemSelectionView({ onSelect }: { onSelect: (system: AppSystem) => void }) {
  const { role } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl space-y-12"
      >
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-stone-900 text-white shadow-xl">
            <Package className="h-10 w-10" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-stone-900 sm:text-5xl">
            請選擇管理系統
          </h1>
          <p className="text-lg text-stone-500">歡迎回來，請選擇您今天要進入的作業環境</p>
        </div>
        
        <div className="grid gap-6 sm:grid-cols-2">
          <motion.button 
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('birthday')}
            className="group flex flex-col items-center gap-8 rounded-[2.5rem] bg-white p-12 shadow-sm border border-stone-100 transition-all hover:shadow-xl hover:border-stone-900"
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-stone-100 text-stone-900 transition-all group-hover:bg-stone-900 group-hover:text-white group-hover:shadow-lg group-hover:rotate-6">
              <Gift className="h-12 w-12" />
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-stone-900">生日禮物系統</h2>
              <p className="mt-3 text-stone-500 leading-relaxed">管理生日禮物庫存、<br />登記發放與兌換紀錄</p>
            </div>
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('points')}
            className="group flex flex-col items-center gap-8 rounded-[2.5rem] bg-white p-12 shadow-sm border border-stone-100 transition-all hover:shadow-xl hover:border-stone-900"
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-stone-100 text-stone-900 transition-all group-hover:bg-stone-900 group-hover:text-white group-hover:shadow-lg group-hover:-rotate-6">
              <Coins className="h-12 w-12" />
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-stone-900">換點數系統</h2>
              <p className="mt-3 text-stone-500 leading-relaxed">管理點數換購庫存、<br />圖片上傳與統整審核</p>
            </div>
          </motion.button>
        </div>

        <div className="text-center">
          <p className="text-sm text-stone-400">登入身份：{role === 'admin' ? '管理員模式' : '工作人員模式'}</p>
        </div>
      </motion.div>
    </div>
  );
}

function SettingsView({ system }: { system: AppSystem }) {
  const [googleAuth, setGoogleAuth] = useState<{ isAuthenticated: boolean }>({ isAuthenticated: false });
  const [settings, setSettings] = useState({ googleSheetsId: '', birthdaySheetName: '生日禮物庫存', pointsSheetName: '換點數禮物庫存' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        setGoogleAuth(data);
      } catch (e) {
        console.error(e);
      }
    };
    fetchStatus();

    const fetchSettings = async () => {
      const q = query(collection(db, 'settings'));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setSettings(snapshot.docs[0].data() as any);
      }
    };
    fetchSettings();

    // Listen for OAuth success from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        fetchStatus();
        toast.success('Google 帳號連接成功');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const q = query(collection(db, 'settings'));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        await addDoc(collection(db, 'settings'), settings);
      } else {
        await updateDoc(doc(db, 'settings', snapshot.docs[0].id), settings);
      }
      toast.success('設定已儲存');
    } catch (e) {
      console.error(e);
      toast.error('儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch('/api/auth/google?json=true');
      const { url } = await res.json();
      
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        url,
        'google_auth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        toast.error('彈出視窗被阻擋，請允許此網站開啟彈出視窗');
      }
    } catch (e) {
      console.error(e);
      toast.error('無法啟動驗證');
    }
  };

  const handleGoogleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setGoogleAuth({ isAuthenticated: false });
    toast.success('已登出 Google 帳號');
  };

  return (
    <div className="space-y-8 py-4">
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold tracking-tight text-stone-900">系統設定</h2>
        <p className="text-stone-500">管理 Google Sheets 連接與系統參數</p>
      </div>

      <div className="grid gap-6">
        {/* Google Auth Section */}
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-stone-100 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-900">Google 帳號連接</h3>
              <p className="text-sm text-stone-500">連接 Google 帳號以直接更新試算表庫存</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-stone-50 p-4">
            <div className="flex items-center gap-3">
              {googleAuth.isAuthenticated ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-stone-400">
                  <X className="h-5 w-5" />
                </div>
              )}
              <span className="text-sm font-medium">
                {googleAuth.isAuthenticated ? '已連接 Google 帳號' : '尚未連接 Google 帳號'}
              </span>
            </div>
            {googleAuth.isAuthenticated ? (
              <button onClick={handleGoogleLogout} className="text-sm font-bold text-red-500 hover:text-red-600">登出</button>
            ) : (
              <button onClick={handleGoogleLogin} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">連接帳號</button>
            )}
          </div>
        </div>

        {/* Sheets Config Section */}
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-stone-100 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-900">試算表設定</h3>
              <p className="text-sm text-stone-500">設定要連動的 Google Sheets 資訊</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-stone-700">Spreadsheet ID</label>
              <input
                type="text"
                value={settings.googleSheetsId}
                onChange={(e) => setSettings({ ...settings, googleSheetsId: e.target.value })}
                placeholder="輸入試算表 ID"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 outline-none focus:border-stone-900 focus:bg-white"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-700">生日禮物分頁名稱</label>
                <input
                  type="text"
                  value={settings.birthdaySheetName}
                  onChange={(e) => setSettings({ ...settings, birthdaySheetName: e.target.value })}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 outline-none focus:border-stone-900 focus:bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-700">換點數分頁名稱</label>
                <input
                  type="text"
                  value={settings.pointsSheetName}
                  onChange={(e) => setSettings({ ...settings, pointsSheetName: e.target.value })}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 outline-none focus:border-stone-900 focus:bg-white"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            儲存設定
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeView({ system, onNavigate }: { system: AppSystem, onNavigate: (tab: string) => void }) {
  const menuItems = [
    { id: 'inventory', label: '總庫存', icon: Package, description: '查看目前所有品項與剩餘數量', color: 'bg-blue-500' },
    { id: 'exchange', label: system === 'birthday' ? '兌換紀錄' : '申請兌換', icon: system === 'birthday' ? ArrowLeftRight : Camera, description: system === 'birthday' ? '登記現場品項兌換與發放' : '上傳兌換圖片供統整人審核', color: 'bg-emerald-500' },
    { id: 'input', label: '庫存輸入', icon: PlusCircle, description: '手動增加或調整庫存數量', color: 'bg-amber-500' },
    { id: 'history', label: '歷史紀錄', icon: History, description: '查看完整的異動歷程與備份', color: 'bg-purple-500' },
    ...(system === 'points' ? [{ id: 'coordinator', label: '統整審核', icon: UserCheck, description: '審核經手人上傳的兌換申請', color: 'bg-rose-500' }] : []),
  ] as const;

  return (
    <div className="space-y-8 py-4">
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold tracking-tight text-stone-900">
          {system === 'birthday' ? '生日禮物系統' : '換點數系統'}
        </h2>
        <p className="text-stone-500">請選擇您要執行的操作</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {menuItems.map((item) => (
          <motion.button
            key={item.id}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate(item.id)}
            className="group relative flex flex-col items-start gap-4 overflow-hidden rounded-3xl bg-white p-6 text-left shadow-sm border border-stone-100 transition-all hover:shadow-md"
          >
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg transition-transform group-hover:scale-110", item.color)}>
              <item.icon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-900">{item.label}</h3>
              <p className="mt-1 text-sm text-stone-500">{item.description}</p>
            </div>
            <div className="absolute right-6 top-6 opacity-0 transition-opacity group-hover:opacity-10">
              <item.icon className="h-24 w-24" />
            </div>
          </motion.button>
        ))}
      </div>

      <div className="rounded-3xl bg-stone-900 p-8 text-white shadow-xl">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="text-lg font-semibold">快速提示</h4>
            <p className="text-stone-400 text-sm">您可以隨時從左側選單切換功能，或點擊上方標題回到此頁面。</p>
          </div>
          <div className="flex -space-x-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-10 rounded-full border-2 border-stone-900 bg-stone-800 flex items-center justify-center">
                <Package className="h-4 w-4 text-stone-500" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryView({ system }: { system: AppSystem }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [sheetId, setSheetId] = useState('');
  const [sheetName, setSheetName] = useState(system === 'birthday' ? '生日禮物庫存' : '換點數禮物庫存');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [isClearing, setIsClearing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    setSheetName(system === 'birthday' ? '生日禮物庫存' : '換點數禮物庫存');
  }, [system]);

  useEffect(() => {
    const q = query(
      collection(db, 'inventory'), 
      where('system', '==', system),
      orderBy('name')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setItems(data);
      setLoading(false);
      
      // Initially expand all categories
      const categories = Array.from(new Set(data.map(i => i.category || '未分類')));
      const initialExpanded: Record<string, boolean> = {};
      categories.forEach(cat => initialExpanded[cat] = true);
      setExpandedCategories(prev => ({ ...initialExpanded, ...prev }));
    });
    return unsubscribe;
  }, [system]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'inventory', id));
      toast.success('品項已刪除');
      setDeleteConfirmId(null);
    } catch (error) {
      console.error(error);
      toast.error('刪除失敗');
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const q = query(collection(db, 'inventory'), where('system', '==', system));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'inventory', d.id)));
      await Promise.all(deletePromises);
      toast.success('所有庫存已清空');
    } catch (error) {
      console.error(error);
      toast.error('清空失敗');
    } finally {
      setIsClearing(false);
    }
  };

  const handleImport = async () => {
    if (!sheetId) {
      toast.error('請輸入試算表 ID');
      return;
    }

    setImporting(true);
    try {
      // Use gviz API to support sheet names
      const encodedSheetName = encodeURIComponent(sheetName);
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodedSheetName}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('無法讀取試算表，請確認 ID 與分頁名稱是否正確，且已開啟「知道連結的人均可檢視」');
      
      const csvText = await response.text();
      // gviz CSV output might have quotes around fields
      const rows = csvText.split('\n').map(row => {
        // Simple CSV parser that handles quotes
        const matches = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        return matches ? matches.map(m => m.replace(/^"|"$/g, '')) : row.split(',');
      });
      
      const dataRows = rows.slice(1);
      let importedCount = 0;

      for (const row of dataRows) {
        let category = '未分類';
        let name = '';
        let sheetExchanged = 0;
        let sheetRemaining = 0;

        if (system === 'points') {
          category = row[0]?.trim() || '未分類';
          name = row[1]?.trim();
          sheetExchanged = parseInt(row[3]?.trim()) || 0;
          sheetRemaining = parseInt(row[4]?.trim()) || 0;
        } else {
          // Birthday system: No category
          name = row[0]?.trim();
          sheetExchanged = parseInt(row[2]?.trim()) || 0;
          sheetRemaining = parseInt(row[3]?.trim()) || 0;
          category = '所有品項';
        }

        if (name && name !== '品項名稱' && name !== '品項' && name !== '品名' && name !== '種類') {
          const q = query(
            collection(db, 'inventory'), 
            where('name', '==', name),
            where('system', '==', system)
          );
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            const docId = snapshot.docs[0].id;
            const existingData = snapshot.docs[0].data();
            const storedExchanged = existingData.totalExchanged || 0;

            const diff = sheetExchanged - storedExchanged;
            if (diff > 0) {
              await addDoc(collection(db, 'exchange_records'), {
                system,
                itemId: docId,
                exchangeItem: name,
                quantity: diff,
                status: 'confirmed',
                handler: '系統輸入',
                date: new Date().toISOString().split('T')[0],
                note: `從 Google Sheets 同步 (累計兌換從 ${storedExchanged} 變為 ${sheetExchanged})`,
                timestamp: serverTimestamp(),
              });
            }

            await updateDoc(doc(db, 'inventory', docId), {
              category,
              quantity: sheetRemaining,
              totalExchanged: sheetExchanged,
              lastUpdated: serverTimestamp(),
            });
          } else {
            const newDoc = await addDoc(collection(db, 'inventory'), {
              system,
              name,
              category,
              quantity: sheetRemaining,
              totalExchanged: sheetExchanged,
              lastUpdated: serverTimestamp(),
            });

            // For new items, record the initial state in history
            if (sheetExchanged > 0 || sheetRemaining > 0) {
              await addDoc(collection(db, 'exchange_records'), {
                system,
                itemId: newDoc.id,
                exchangeItem: name,
                quantity: sheetRemaining,
                status: 'confirmed',
                handler: '系統輸入',
                date: new Date().toISOString().split('T')[0],
                note: `從 Google Sheets 匯入新項目 (初始庫存: ${sheetRemaining}, 累計兌換: ${sheetExchanged})`,
                timestamp: serverTimestamp(),
              });
            }
          }
          importedCount++;
        }
      }

      toast.success(`成功匯入 ${importedCount} 個品項`);
      setShowImportModal(false);
      setSheetId('');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : '匯入失敗');
    } finally {
      setImporting(false);
    }
  };

  const groupedItems = items.reduce((acc, item) => {
    const cat = system === 'birthday' ? '所有品項' : (item.category || '未分類');
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  // Sort items within each category: quantity > 0 first, then by name
  Object.keys(groupedItems).forEach(cat => {
    groupedItems[cat].sort((a, b) => {
      if (a.quantity > 0 && b.quantity === 0) return -1;
      if (a.quantity === 0 && b.quantity > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  });

  const sortedCategories = Object.keys(groupedItems).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-stone-900">總庫存數量</h2>
          <p className="text-stone-500">目前所有品項的即時庫存統計</p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <button
              onClick={() => {
                if (clearConfirm) {
                  handleClearAll();
                  setClearConfirm(false);
                } else {
                  setClearConfirm(true);
                  setTimeout(() => setClearConfirm(false), 3000);
                }
              }}
              disabled={isClearing}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all",
                clearConfirm 
                  ? "border-red-500 bg-red-500 text-white animate-pulse" 
                  : "border-red-200 bg-white text-red-600 hover:bg-red-50"
              )}
            >
              {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {clearConfirm ? '再次點擊確認清空' : '清空全部'}
            </button>
          )}
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 transition-all hover:bg-stone-50"
          >
            <PlusCircle className="h-4 w-4" />
            從 Google Sheets 匯入
          </button>
        </div>
      </div>

      {/* Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowImportModal(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-stone-900">匯入 Google Sheets</h3>
              <p className="mt-2 text-sm text-stone-500">
                請輸入試算表 ID。請確保該試算表已設定為「知道連結的人均可檢視」。
              </p>
              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Spreadsheet ID</label>
                  <input
                    type="text"
                    value={sheetId}
                    onChange={(e) => setSheetId(e.target.value)}
                    placeholder="例如: 1BxiMVs0XRA5nFMdKvBdBZj..."
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none focus:border-stone-900 focus:bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-400">分頁名稱 (Sheet Name)</label>
                  <input
                    type="text"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="例如: 工作表1"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none focus:border-stone-900 focus:bg-white"
                  />
                  <p className="text-[10px] text-stone-400 italic">預設已根據系統切換為「{system === 'birthday' ? '生日禮物庫存' : '換點數禮物庫存'}」</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowImportModal(false)}
                    className="flex-1 rounded-xl border border-stone-200 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                    開始匯入
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="space-y-8">
        {loading ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-stone-200" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-stone-200 py-12 text-stone-400">
            <Package className="mb-4 h-12 w-12 opacity-20" />
            <p>目前尚無庫存資料</p>
          </div>
        ) : system === 'birthday' ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items
              .sort((a, b) => {
                if (a.quantity > 0 && b.quantity === 0) return -1;
                if (a.quantity === 0 && b.quantity > 0) return 1;
                return a.name.localeCompare(b.name);
              })
              .map((item) => (
                <InventoryCard 
                  key={item.id} 
                  item={item} 
                  onDelete={handleDelete} 
                  deleteConfirmId={deleteConfirmId} 
                  setDeleteConfirmId={setDeleteConfirmId} 
                />
              ))}
          </div>
        ) : (
          sortedCategories.map((category) => (
            <div key={category} className="space-y-4">
              <button 
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center justify-between rounded-2xl bg-stone-100 px-6 py-3 transition-all hover:bg-stone-200"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
                    <Package className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold text-stone-900">{category}</h3>
                  <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                    {groupedItems[category].length} 品項
                  </span>
                </div>
                {expandedCategories[category] ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </button>
              
              <AnimatePresence>
                {expandedCategories[category] && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 p-1">
                      {groupedItems[category].map((item) => (
                        <InventoryCard 
                          key={item.id} 
                          item={item} 
                          onDelete={handleDelete} 
                          deleteConfirmId={deleteConfirmId} 
                          setDeleteConfirmId={setDeleteConfirmId} 
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const HANDLERS = ['許詩', '愛萍', '素玲', '國盛', '幸娟', '蘭茜', '浙鑫', '蓉芳', '鍾祥'];

interface InventoryCardProps {
  key?: any;
  item: InventoryItem;
  onDelete: (id: string) => any;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;
}

function InventoryCard({ item, onDelete, deleteConfirmId, setDeleteConfirmId }: InventoryCardProps) {
  const { role } = useAuth();
  return (
    <motion.div
      layout
      className="group relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm border border-stone-100 transition-all hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-stone-900" title={item.name}>{item.name}</h3>
          <p className="mt-0.5 truncate text-[10px] text-stone-400">
            {item.lastUpdated ? format(item.lastUpdated.toDate(), 'MM-dd HH:mm') : '無紀錄'}
          </p>
        </div>
        {role === 'admin' && (
          <div className="flex items-center gap-1">
            {deleteConfirmId === item.id ? (
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => onDelete(item.id!)}
                  className="rounded-lg bg-red-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-600"
                >
                  確認
                </button>
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="rounded-lg bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-600 hover:bg-stone-200"
                >
                  取消
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setDeleteConfirmId(item.id!)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="刪除品項"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className={cn(
          "text-2xl font-black tracking-tighter",
          item.quantity < 1 ? "text-red-500" : "text-blue-600"
        )}>{item.quantity}</span>
        <span className="text-[10px] font-medium text-stone-400">份</span>
      </div>
    </motion.div>
  );
}

function ExchangeForm() {
  const { role } = useAuth();
  const [handler, setHandler] = useState(HANDLERS[0]);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [items, setItems] = useState([{ exchangeItem: '', quantity: 1 }]);
  const [submitting, setSubmitting] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    const fetchItems = async () => {
      const q = query(collection(db, 'inventory'), where('system', '==', 'birthday'));
      const snapshot = await getDocs(q);
      setInventoryItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    };
    fetchItems();
  }, []);

  const addItem = () => {
    setItems([...items, { exchangeItem: '', quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalidItems = items.filter(i => !i.exchangeItem || i.quantity <= 0);
    if (invalidItems.length > 0) {
      toast.error('請填寫完整資訊');
      return;
    }

    setSubmitting(true);
    try {
      const summary = items.map(i => `${i.exchangeItem} x${i.quantity}`).join(', ');
      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

      await addDoc(collection(db, 'exchange_records'), {
        handler,
        date,
        exchangeItem: summary,
        quantity: totalQty,
        system: 'birthday',
        status: 'confirmed',
        timestamp: serverTimestamp(),
      });

      // Send Email Notification
      try {
        await emailjs.send(
          'newapplyforstock',
          'template_6z6w8yo',
          {
            handler: handler,
            date: date,
            quantity: totalQty,
            system_name: '生日禮物系統',
          },
          'u7AYGRrkIMHfhL6Pc'
        );
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
      }

      for (const item of items) {
        const itemToUpdate = inventoryItems.find(i => i.name === item.exchangeItem);
        if (itemToUpdate && itemToUpdate.id) {
          await updateDoc(doc(db, 'inventory', itemToUpdate.id), {
            quantity: itemToUpdate.quantity - item.quantity,
            lastUpdated: serverTimestamp(),
          });
          // Sync to Google Sheets
          await syncToGoogleSheets('birthday', item.exchangeItem, item.quantity, handler, date);
        }
      }

      toast.success('兌換紀錄已儲存');
      setItems([{ exchangeItem: '', quantity: 1 }]);
    } catch (error) {
      console.error(error);
      toast.error('儲存失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-stone-900">兌換紀錄填寫</h2>
        <p className="text-stone-500">請輸入兌換的詳細資訊</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl bg-white p-6 shadow-sm border border-stone-100 lg:p-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-700">經手人</label>
            <select
              value={handler}
              onChange={(e) => setHandler(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 outline-none transition-all focus:border-stone-900 focus:bg-white"
            >
              {HANDLERS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-700">日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 outline-none transition-all focus:border-stone-900 focus:bg-white"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-stone-700">兌換項目 (出庫)</label>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              <PlusCircle className="h-4 w-4" />
              增加品項
            </button>
          </div>
          
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="flex items-end gap-3 rounded-2xl border border-stone-100 bg-stone-50/50 p-4">
                <div className="flex-1 space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">品項 {index + 1}</label>
                  <select
                    value={item.exchangeItem}
                    onChange={(e) => updateItem(index, 'exchangeItem', e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-stone-900"
                  >
                    <option value="">請選擇品項</option>
                    {inventoryItems
                      .filter(i => i.quantity > 0)
                      .map(i => (
                        <option key={i.id} value={i.name}>
                          {i.name} (剩餘: {i.quantity})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="w-24 space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">數量</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-stone-900"
                  />
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="mb-1 p-2 text-stone-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || role !== 'admin'}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3 font-semibold text-white transition-all hover:bg-stone-800 disabled:opacity-50 active:scale-[0.98]"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowLeftRight className="h-5 w-5" />}
          {role === 'admin' ? '儲存紀錄' : '工作人員無權限儲存'}
        </button>
      </form>
    </div>
  );
}

function PointsExchangeRequest() {
  const [formData, setFormData] = useState({
    handler: HANDLERS[0],
    date: format(new Date(), 'yyyy-MM-dd'),
    quantity: 1,
    imageUrl: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.imageUrl) {
      toast.error('請上傳兌換品項圖片');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'exchange_records'), {
        ...formData,
        system: 'points',
        status: 'pending',
        timestamp: serverTimestamp(),
      });

      // Send Email Notification
      try {
        await emailjs.send(
          'newapplyforstock',
          'template_6z6w8yo',
          {
            handler: formData.handler,
            date: formData.date,
            quantity: formData.quantity,
            system_name: '換點數系統',
          },
          'u7AYGRrkIMHfhL6Pc'
        );
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
      }

      toast.success('兌換申請已提交，並已通知管理員');
      setFormData({ ...formData, imageUrl: '', quantity: 1 });
    } catch (error) {
      console.error(error);
      toast.error('提交失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG with 0.7 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setFormData({ ...formData, imageUrl: dataUrl });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-stone-900">申請兌換 (換點數)</h2>
        <p className="text-stone-500">請上傳兌換圖片並輸入總數量供審核</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl bg-white p-6 shadow-sm border border-stone-100 lg:p-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-700">經手人</label>
            <select
              value={formData.handler}
              onChange={(e) => setFormData({ ...formData, handler: e.target.value })}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 outline-none focus:border-stone-900 focus:bg-white"
            >
              {HANDLERS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-700">日期</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 outline-none focus:border-stone-900 focus:bg-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-700">確認總兌換數量</label>
            <input
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 outline-none focus:border-stone-900 focus:bg-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-stone-700">兌換品項圖片</label>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              />
              <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 text-stone-400">
                {formData.imageUrl ? (
                  <img src={formData.imageUrl} alt="Preview" className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Camera className="h-8 w-8" />
                    <span className="text-xs">點擊或拖曳上傳圖片</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3 font-semibold text-white transition-all hover:bg-stone-800 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          提交申請
        </button>
      </form>
    </div>
  );
}

function CoordinatorLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleNumberClick = (num: string) => {
    if (password.length < 4) {
      const newPassword = password + num;
      setPassword(newPassword);
      if (newPassword === '1218') {
        onAuthenticated();
        toast.success('登入成功，歡迎 許詩');
      } else if (newPassword.length === 4) {
        setError(true);
        setTimeout(() => {
          setPassword('');
          setError(false);
        }, 500);
        toast.error('密碼錯誤');
      }
    }
  };

  const handleDelete = () => {
    setPassword(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPassword('');
  };

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-[2.5rem] bg-white p-8 shadow-xl border border-stone-100"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-white">
            <UserCheck className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-stone-900">統整人登入</h2>
        </div>

        <div className="mb-6 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">登入姓名</label>
            <div className="w-full rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-900">
              許詩
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">輸入密碼</label>
            <div className="flex justify-center gap-3 py-2">
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className={cn(
                    "h-3 w-3 rounded-full border-2 transition-all duration-300",
                    password.length > i ? "bg-stone-900 border-stone-900" : "bg-transparent border-stone-200",
                    error && "animate-shake border-red-500 bg-red-500"
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              className="flex h-16 items-center justify-center rounded-2xl bg-stone-50 text-xl font-bold text-stone-900 transition-all hover:bg-stone-100 active:scale-95"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="flex h-16 items-center justify-center rounded-2xl bg-stone-50 text-sm font-bold text-stone-400 transition-all hover:bg-stone-100 active:scale-95"
          >
            清除
          </button>
          <button
            onClick={() => handleNumberClick('0')}
            className="flex h-16 items-center justify-center rounded-2xl bg-stone-50 text-xl font-bold text-stone-900 transition-all hover:bg-stone-100 active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="flex h-16 items-center justify-center rounded-2xl bg-stone-50 text-stone-400 transition-all hover:bg-stone-100 active:scale-95"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CoordinatorView() {
  const { role } = useAuth();
  const [pendingRecords, setPendingRecords] = useState<ExchangeRecord[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<ExchangeRecord | null>(null);
  const [details, setDetails] = useState('');
  const [reviewItems, setReviewItems] = useState<{ category: string; itemName: string; quantity: number }[]>([
    { category: '', itemName: '', quantity: 1 }
  ]);
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'exchange_records'), 
      where('system', '==', 'points'),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExchangeRecord)));
      setLoading(false);
    });

    const fetchInventory = async () => {
      const qInv = query(collection(db, 'inventory'), where('system', '==', 'points'));
      const snapshot = await getDocs(qInv);
      setInventoryItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    };
    fetchInventory();

    return unsubscribe;
  }, []);

  // Reset review items and delete confirm when selected record changes
  useEffect(() => {
    if (selectedRecord) {
      setReviewItems([{ category: '', itemName: '', quantity: selectedRecord.quantity }]);
      setDetails('');
      setDeleteConfirm(false);
    }
  }, [selectedRecord]);

  const categories = Array.from(new Set(inventoryItems.map(i => i.category)));

  const addReviewItem = () => {
    setReviewItems([...reviewItems, { category: '', itemName: '', quantity: 1 }]);
  };

  const removeReviewItem = (index: number) => {
    if (reviewItems.length > 1) {
      setReviewItems(reviewItems.filter((_, i) => i !== index));
    }
  };

  const updateReviewItem = (index: number, field: string, value: any) => {
    const newItems = [...reviewItems];
    (newItems[index] as any)[field] = value;
    if (field === 'category') {
      newItems[index].itemName = '';
    }
    setReviewItems(newItems);
  };

  const totalReviewQuantity = reviewItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const isQuantityMatch = selectedRecord ? totalReviewQuantity === selectedRecord.quantity : false;

  const handleConfirm = async () => {
    if (!selectedRecord) return;

    const invalidItems = reviewItems.filter(item => !item.itemName || item.quantity <= 0);
    if (invalidItems.length > 0) {
      toast.error('請完整填寫所有品項資訊');
      return;
    }

    setConfirming(true);
    try {
      // 1. Update record
      const itemsSummary = reviewItems.map(i => `${i.itemName} x${i.quantity}`).join(', ');
      await updateDoc(doc(db, 'exchange_records', selectedRecord.id!), {
        status: 'confirmed',
        exchangeItem: itemsSummary,
        details,
        timestamp: serverTimestamp(),
      });

      // 2. Update inventory for each item
      for (const reviewItem of reviewItems) {
        const item = inventoryItems.find(i => i.name === reviewItem.itemName);
        if (item && item.id) {
          await updateDoc(doc(db, 'inventory', item.id), {
            quantity: item.quantity - reviewItem.quantity,
            totalExchanged: (item.totalExchanged || 0) + reviewItem.quantity,
            lastUpdated: serverTimestamp(),
          });
          // Sync to Google Sheets
          await syncToGoogleSheets('points', reviewItem.itemName, reviewItem.quantity, selectedRecord.handler, selectedRecord.date);
        }
      }

      toast.success('審核完成，庫存已扣除');
      setSelectedRecord(null);
    } catch (error) {
      console.error(error);
      toast.error('審核失敗');
    } finally {
      setConfirming(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!selectedRecord) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'exchange_records', selectedRecord.id!));
      toast.success('審核單已刪除');
      setSelectedRecord(null);
      setDeleteConfirm(false);
    } catch (error) {
      console.error(error);
      toast.error('刪除失敗');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-stone-400" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-stone-900">統整人審核頁面</h2>
        <p className="text-stone-500">檢查經手人上傳的紀錄並確認入庫</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-stone-900">待處理項目 ({pendingRecords.length})</h3>
        {pendingRecords.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-stone-200 py-12 text-center text-stone-400">
            目前無待處理申請
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRecords.map(record => (
              <div key={record.id} className="space-y-4">
                <button
                  onClick={() => setSelectedRecord(selectedRecord?.id === record.id ? null : record)}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all",
                    selectedRecord?.id === record.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-100 bg-white hover:border-stone-300"
                  )}
                >
                  <div className="h-12 w-12 overflow-hidden rounded-xl bg-stone-100">
                    {record.imageUrl ? <img src={record.imageUrl} className="h-full w-full object-cover" /> : <ImageIcon className="h-full w-full p-3 text-stone-300" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">經手人: {record.handler}</span>
                      <span className="text-xs opacity-60">{record.date}</span>
                    </div>
                    <p className="text-sm opacity-80">申請數量: {record.quantity}</p>
                  </div>
                  {selectedRecord?.id === record.id ? <ChevronDown className="h-5 w-5 opacity-60" /> : <ChevronRight className="h-5 w-5 opacity-60" />}
                </button>

                {/* Inline Review Panel */}
                <AnimatePresence>
                  {selectedRecord?.id === record.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-6 rounded-3xl bg-white p-6 shadow-sm border border-stone-100">
                        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-stone-100">
                          <img src={record.imageUrl} className="h-full w-full object-contain" />
                        </div>
                        
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">申請總數</p>
                              <p className="text-2xl font-black text-stone-900">{record.quantity}</p>
                            </div>
                            <div className="text-right space-y-1">
                              <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">目前分配總數</p>
                              <p className={cn(
                                "text-2xl font-black transition-colors",
                                isQuantityMatch ? "text-emerald-600" : "text-amber-500"
                              )}>
                                {totalReviewQuantity}
                              </p>
                            </div>
                          </div>

                          {!isQuantityMatch && (
                            <div className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-700 border border-amber-100">
                              ⚠️ 分配總數 ({totalReviewQuantity}) 與申請數量 ({record.quantity}) 不一致
                            </div>
                          )}

                          <div className="space-y-2">
                            <label className="text-sm font-bold text-stone-700">兌換細項 (備註)</label>
                            <textarea
                              value={details}
                              onChange={(e) => setDetails(e.target.value)}
                              placeholder="輸入詳細說明..."
                              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-stone-900 focus:bg-white"
                            />
                          </div>

                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-stone-700">分配品項</label>
                              <button 
                                onClick={addReviewItem}
                                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                              >
                                <PlusCircle className="h-4 w-4" />
                                增加選項
                              </button>
                            </div>

                            <div className="space-y-3">
                              {reviewItems.map((item, index) => (
                                <div key={index} className="relative space-y-3 rounded-2xl bg-stone-50 p-4 border border-stone-100">
                                  {reviewItems.length > 1 && (
                                    <button 
                                      onClick={() => removeReviewItem(index)}
                                      className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-stone-400 shadow-sm border border-stone-100 hover:text-red-500"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  )}
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-stone-400 uppercase">種類</label>
                                      <select
                                        value={item.category}
                                        onChange={(e) => updateReviewItem(index, 'category', e.target.value)}
                                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs outline-none focus:border-stone-900"
                                      >
                                        <option value="">請選擇種類</option>
                                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                      </select>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-stone-400 uppercase">品項</label>
                                      <select
                                        value={item.itemName}
                                        onChange={(e) => updateReviewItem(index, 'itemName', e.target.value)}
                                        disabled={!item.category}
                                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs outline-none focus:border-stone-900 disabled:opacity-50"
                                      >
                                        <option value="">請選擇品項</option>
                                        {inventoryItems
                                          .filter(i => i.category === item.category && i.quantity > 0)
                                          .map(i => <option key={i.id} value={i.name}>{i.name} (剩: {i.quantity})</option>)}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-stone-400 uppercase">數量</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => updateReviewItem(index, 'quantity', parseInt(e.target.value) || 0)}
                                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs outline-none focus:border-stone-900"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={() => {
                                if (deleteConfirm) {
                                  handleDeleteRecord();
                                } else {
                                  setDeleteConfirm(true);
                                  setTimeout(() => setDeleteConfirm(false), 3000);
                                }
                              }}
                              disabled={isDeleting || role !== 'admin'}
                              className={cn(
                                "flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-bold transition-all disabled:opacity-50",
                                deleteConfirm 
                                  ? "bg-red-500 text-white animate-pulse" 
                                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                              )}
                            >
                              {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                              {deleteConfirm ? '再次點擊確認刪除' : '刪除這筆審核'}
                            </button>

                            <button
                              onClick={handleConfirm}
                              disabled={confirming || role !== 'admin'}
                              className={cn(
                                "flex flex-[2] items-center justify-center gap-2 rounded-xl py-3 font-bold text-white transition-all hover:bg-stone-800 disabled:opacity-50",
                                isQuantityMatch && role === 'admin' ? "bg-stone-900" : "bg-stone-400"
                              )}
                            >
                              {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                              {role === 'admin' ? '允許並扣除庫存' : '工作人員無權限審核'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InventoryInputView({ system }: { system: AppSystem }) {
  const { role } = useAuth();
  const [handler, setHandler] = useState(HANDLERS[0]);
  const [items, setItems] = useState([{ name: '', category: '', quantity: 0 }]);
  const [submitting, setSubmitting] = useState(false);

  const addItem = () => {
    setItems([...items, { name: '', category: '', quantity: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalidItems = items.filter(i => !i.name || i.quantity <= 0);
    if (invalidItems.length > 0) {
      toast.error('請填寫正確資訊');
      return;
    }

    setSubmitting(true);
    try {
      for (const item of items) {
        const q = query(
          collection(db, 'inventory'), 
          where('name', '==', item.name),
          where('system', '==', system)
        );
        const snapshot = await getDocs(q);

        let docId = '';
        if (!snapshot.empty) {
          docId = snapshot.docs[0].id;
          const currentQty = snapshot.docs[0].data().quantity;
          await updateDoc(doc(db, 'inventory', docId), {
            quantity: currentQty + item.quantity,
            lastUpdated: serverTimestamp(),
          });
        } else {
          const newDoc = await addDoc(collection(db, 'inventory'), {
            system,
            name: item.name,
            category: item.category || (system === 'birthday' ? '所有品項' : '未分類'),
            quantity: item.quantity,
            totalExchanged: 0,
            lastUpdated: serverTimestamp(),
          });
          docId = newDoc.id;
        }

        await addDoc(collection(db, 'exchange_records'), {
          system,
          itemId: docId,
          exchangeItem: item.name,
          quantity: item.quantity,
          handler: handler,
          status: 'confirmed',
          note: '手動入庫',
          date: new Date().toISOString().split('T')[0],
          timestamp: serverTimestamp(),
        });
      }

      toast.success('庫存已更新並記錄');
      setItems([{ name: '', category: '', quantity: 0 }]);
    } catch (error) {
      console.error(error);
      toast.error('更新失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-stone-900">庫存輸入</h2>
        <p className="text-stone-500">手動增加或調整品項數量</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl bg-white p-6 shadow-sm border border-stone-100 lg:p-8">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-stone-700">經手人</label>
          <select
            value={handler}
            onChange={(e) => setHandler(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 outline-none focus:border-stone-900 focus:bg-white sm:w-64"
          >
            {HANDLERS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-stone-700">入庫品項</label>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              <PlusCircle className="h-4 w-4" />
              增加品項
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-100 bg-stone-50/50 p-4">
                <div className="flex-1 min-w-[200px] space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">品項名稱 {index + 1}</label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(index, 'name', e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-stone-900"
                    placeholder="請輸入品項"
                  />
                </div>
                {system === 'points' && (
                  <div className="flex-1 min-w-[150px] space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">種類 (分類)</label>
                    <input
                      type="text"
                      value={item.category}
                      onChange={(e) => updateItem(index, 'category', e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-stone-900"
                      placeholder="例如: 零食"
                    />
                  </div>
                )}
                <div className="w-24 space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400">增加數量</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-stone-900"
                  />
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="mb-1 p-2 text-stone-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || role !== 'admin'}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3 font-semibold text-white transition-all hover:bg-stone-800 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlusCircle className="h-5 w-5" />}
          {role === 'admin' ? '確認輸入' : '工作人員無權限輸入'}
        </button>
      </form>
    </div>
  );
}

function HistoryView({ system }: { system: AppSystem }) {
  const [records, setRecords] = useState<ExchangeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'exchange_records'), 
      where('system', '==', system),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExchangeRecord));
      setRecords(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [system]);

  const groupedRecords = records.reduce((acc, record) => {
    // Group by date and timestamp (rounded to minute to group records created together)
    const date = record.date;
    const timeKey = record.timestamp ? format(record.timestamp.toDate(), 'HH:mm') : '00:00';
    const groupKey = `${date} ${timeKey}`;
    
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(record);
    return acc;
  }, {} as Record<string, ExchangeRecord[]>);

  const sortedGroupKeys = Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a));

  const exportToCSV = () => {
    if (records.length === 0) {
      toast.error('尚無資料可匯出');
      return;
    }

    const headers = ['日期', '經手人', '品項', '數量', '狀態', '備註'];
    const csvRows = [
      headers.join(','),
      ...records.map(r => [
        r.date,
        r.handler,
        r.exchangeItem || '待審核',
        r.quantity,
        r.status === 'confirmed' ? '已確認' : '待處理',
        r.note || r.details || ''
      ].map(val => `"${val}"`).join(','))
    ];

    const blob = new Blob(['\ufeff' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${system === 'birthday' ? '生日禮物' : '換點數'}_歷史紀錄_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('匯出成功');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-stone-900">歷史紀錄</h2>
          <p className="text-stone-500">所有兌換與異動的詳細歷程</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 transition-all hover:bg-stone-50"
        >
          <LogOut className="h-4 w-4 rotate-90" />
          匯出 CSV
        </button>
      </div>

      <div className="space-y-8">
        {loading ? (
          <div className="h-64 animate-pulse rounded-3xl bg-stone-100" />
        ) : sortedGroupKeys.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-stone-200 py-12 text-center text-stone-400">
            目前尚無紀錄
          </div>
        ) : (
          sortedGroupKeys.map((groupKey) => {
            const groupRecords = groupedRecords[groupKey];
            const [date, time] = groupKey.split(' ');
            return (
              <div key={groupKey} className="space-y-4">
                <div className="flex items-center gap-2 sticky top-0 z-10 bg-stone-50/80 py-2 backdrop-blur-sm">
                  <h3 className="text-sm font-bold text-stone-400">{date}</h3>
                  <span className="text-[10px] font-medium text-stone-300">{time}</span>
                </div>
                <div className="rounded-2xl bg-white shadow-sm border border-stone-100 divide-y divide-stone-50">
                  {groupRecords.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                          record.status === 'confirmed' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        )}>
                          {record.status === 'confirmed' ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-stone-900 truncate">
                            {record.handler}: {record.exchangeItem || '待審核品項'} x {record.quantity}
                          </p>
                          { (record.note || record.details) && (
                            <p className="text-[10px] text-stone-400 truncate">{record.note || record.details}</p>
                          )}
                        </div>
                      </div>
                      {record.imageUrl && (
                        <div className="h-8 w-8 overflow-hidden rounded-lg bg-stone-100 shrink-0 ml-2">
                          <img src={record.imageUrl} className="h-full w-full object-cover" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

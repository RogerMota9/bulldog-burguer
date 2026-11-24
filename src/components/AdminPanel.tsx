import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  Addon,
  AdminOverviewPayload,
  Category,
  Product,
  StoreSettings,
  StoreStatusMode,
} from '../types';
import { formatCurrency, ORDERED_DAYS } from '../utils/format';
import { BrandWordmark, SafeFoodImage } from './BulldogLogo';

interface AdminPanelProps {
  onBackToMenu: () => void;
  onDataChanged: () => void;
}

type AdminTab = 'dashboard' | 'products' | 'categories' | 'addons' | 'settings' | 'security';

export function AdminPanel({ onBackToMenu, onDataChanged }: AdminPanelProps) {
  // Token kept strictly in React memory (never localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodForm, setProdForm] = useState({
    name: '',
    description: '',
    price: '',
    category_id: 0,
    image_url: '',
    featured: false,
    active: true,
    available: true,
    is_demo: false,
    addon_ids: [] as number[],
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [productFilterCat, setProductFilterCat] = useState<number>(0);

  // Category modal/form state
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: '', description: '', active: true });

  // Addon modal/form state
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [addonForm, setAddonForm] = useState({ name: '', price: '', active: true });

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<StoreSettings | null>(null);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');

  // Password change state
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    kind: 'product' | 'category' | 'addon';
    id: number;
    label: string;
  } | null>(null);

  const showNotice = useCallback((type: 'ok' | 'err', text: string) => {
    setBannerNotice({ type, text });
    setTimeout(() => {
      setBannerNotice((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  }, []);

  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.status === 401) {
        setToken(null);
        setOverview(null);
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar solicitação.');
      }
      return data;
    },
    [token],
  );

  const loadOverview = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = (await authFetch('/api/admin/overview')) as AdminOverviewPayload;
      setOverview(data);
      setSettingsForm(data.settings);
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Falha ao carregar painel.');
    } finally {
      setLoading(false);
    }
  }, [token, authFetch, showNotice]);

  useEffect(() => {
    if (token) {
      void loadOverview();
    }
  }, [token, loadOverview]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.status === 404 || !contentType.includes('application/json')) {
        setLoginError(
          'O servidor Node (/api) não está ativo nesta hospedagem estática. Para usar o painel administrativo e o banco de dados, execute o projeto em um servidor Node (npm start) como Render, Railway ou Cloud Run.',
        );
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Credenciais inválidas.');
        return;
      }
      setToken(data.token);
      setAdminEmail(data.email);
      setLoginPassword('');
    } catch {
      setLoginError('Não foi possível conectar ao servidor.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleImageFileUpload = async (
    file: File,
    onSuccess: (uploadedUrl: string) => void,
  ) => {
    if (!file.type.startsWith('image/')) {
      showNotice('err', 'Selecione um arquivo de imagem válido (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 4.5 * 1024 * 1024) {
      showNotice('err', 'A imagem deve ter no máximo 4,5 MB.');
      return;
    }

    setUploadingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
        reader.readAsDataURL(file);
      });

      const data = (await authFetch('/api/admin/upload', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, dataUrl }),
      })) as { url: string };

      onSuccess(data.url);
      showNotice('ok', 'Imagem enviada com sucesso.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Erro no upload.');
    } finally {
      setUploadingImage(false);
    }
  };

  const openNewProduct = () => {
    const firstCatId = overview?.categories[0]?.id || 0;
    setEditingProduct(null);
    setProdForm({
      name: '',
      description: '',
      price: '',
      category_id: firstCatId,
      image_url: '',
      featured: false,
      active: true,
      available: true,
      is_demo: false,
      addon_ids: [],
    });
    setProductModalOpen(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProdForm({
      name: product.name,
      description: product.description,
      price: product.price.toFixed(2),
      category_id: product.category_id,
      image_url: product.image_url,
      featured: product.featured,
      active: product.active,
      available: product.available,
      is_demo: product.is_demo,
      addon_ids: product.addons.map((a) => a.id),
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...prodForm,
        price: Number(prodForm.price.replace(',', '.')),
      };
      if (editingProduct) {
        await authFetch(`/api/admin/products/${editingProduct.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showNotice('ok', 'Produto atualizado no cardápio.');
      } else {
        await authFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showNotice('ok', 'Produto cadastrado com sucesso.');
      }
      setProductModalOpen(false);
      await loadOverview();
      onDataChanged();
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Erro ao salvar produto.');
    }
  };

  const toggleProductQuick = async (product: Product, field: 'active' | 'available' | 'featured') => {
    try {
      await authFetch(`/api/admin/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          category_id: product.category_id,
          name: product.name,
          description: product.description,
          price: product.price,
          image_url: product.image_url,
          featured: field === 'featured' ? !product.featured : product.featured,
          active: field === 'active' ? !product.active : product.active,
          available: field === 'available' ? !product.available : product.available,
          is_demo: product.is_demo,
          addon_ids: product.addons.map((a) => a.id),
        }),
      });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Erro ao atualizar produto.');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await authFetch(`/api/admin/categories/${editingCategory.id}`, {
          method: 'PUT',
          body: JSON.stringify(catForm),
        });
        showNotice('ok', 'Categoria atualizada.');
      } else {
        await authFetch('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify(catForm),
        });
        showNotice('ok', 'Categoria criada.');
      }
      setCatModalOpen(false);
      await loadOverview();
      onDataChanged();
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Erro ao salvar categoria.');
    }
  };

  const moveCategory = async (index: number, direction: -1 | 1) => {
    if (!overview) return;
    const list = [...overview.categories];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(target, 0, moved);
    try {
      await authFetch('/api/admin/categories/reorder', {
        method: 'PUT',
        body: JSON.stringify({ orderedIds: list.map((c) => c.id) }),
      });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Erro ao reordenar.');
    }
  };

  const handleSaveAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: addonForm.name,
        price: Number(addonForm.price.replace(',', '.')),
        active: addonForm.active,
      };
      if (editingAddon) {
        await authFetch(`/api/admin/addons/${editingAddon.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showNotice('ok', 'Adicional atualizado.');
      } else {
        await authFetch('/api/admin/addons', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showNotice('ok', 'Adicional criado.');
      }
      setAddonModalOpen(false);
      await loadOverview();
      onDataChanged();
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Erro ao salvar adicional.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const endpoint =
        deleteConfirm.kind === 'product'
          ? `/api/admin/products/${deleteConfirm.id}`
          : deleteConfirm.kind === 'category'
            ? `/api/admin/categories/${deleteConfirm.id}`
            : `/api/admin/addons/${deleteConfirm.id}`;

      await authFetch(endpoint, { method: 'DELETE' });
      showNotice('ok', `${deleteConfirm.label} removido com sucesso.`);
      setDeleteConfirm(null);
      await loadOverview();
      onDataChanged();
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Erro ao excluir.');
      setDeleteConfirm(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    try {
      await authFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm),
      });
      showNotice('ok', 'Configurações salvas e publicadas no cardápio.');
      await loadOverview();
      onDataChanged();
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.newPassword.length < 8) {
      showNotice('err', 'A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      showNotice('err', 'A confirmação de senha não confere.');
      return;
    }
    try {
      await authFetch('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: pwdForm.currentPassword,
          newPassword: pwdForm.newPassword,
        }),
      });
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showNotice('ok', 'Senha alterada com segurança.');
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : 'Erro ao alterar senha.');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-charcoal-texture flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl bg-[#141418] border border-white/10 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between gap-4">
            <BrandWordmark size="md" />
            <button
              type="button"
              onClick={onBackToMenu}
              className="text-xs font-medium text-zinc-400 hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao cardápio
            </button>
          </div>

          <div>
            <h1 className="font-display text-3xl font-bold text-white">Painel Administrativo</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Acesse com suas credenciais para gerenciar produtos, adicionais e configurações.
            </p>
          </div>

          {loginError && (
            <div className="rounded-xl bg-red-500/15 border border-red-500/40 px-4 py-3 text-sm text-red-200">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                E-mail do administrador
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="w-full min-h-[46px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Senha
              </label>
              <input
                id="admin-password"
                type="password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full min-h-[46px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {loginLoading ? 'Entrando...' : 'Entrar no painel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'products', label: 'Produtos', icon: Package },
    { id: 'categories', label: 'Categorias', icon: FolderKanban },
    { id: 'addons', label: 'Adicionais', icon: SlidersHorizontal },
    { id: 'settings', label: 'Configurações', icon: SettingsIcon },
    { id: 'security', label: 'Alterar Senha', icon: KeyRound },
  ];

  const filteredProducts =
    overview?.products.filter((p) => (productFilterCat === 0 ? true : p.category_id === productFilterCat)) ||
    [];

  return (
    <div className="min-h-screen bg-[#0B0B0E] text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-30 bg-[#111115]/95 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <BrandWordmark logoUrl={overview?.settings.logo_url} storeName={overview?.settings.store_name} size="sm" />
          <span className="hidden sm:inline text-xs text-zinc-400 truncate">
            Painel · {adminEmail}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToMenu}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-white/15 text-xs font-medium text-zinc-200 hover:bg-white/5 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ver Cardápio</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setToken(null);
              setOverview(null);
            }}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-red-600/20 border border-white/10 text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-56 shrink-0">
          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto pb-2 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 space-y-6">
          {bannerNotice && (
            <div
              className={`rounded-xl px-4 py-3 text-sm border flex items-center justify-between gap-3 ${
                bannerNotice.type === 'ok'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-500/15 border-red-500/40 text-red-200'
              }`}
            >
              <span>{bannerNotice.text}</span>
              <button type="button" onClick={() => setBannerNotice(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {loading && !overview ? (
            <div className="rounded-2xl bg-[#141418] border border-white/10 p-8 text-center text-sm text-zinc-400">
              Carregando painel administrativo...
            </div>
          ) : (
            <>
              {/* TAB: DASHBOARD */}
              {tab === 'dashboard' && overview && (
                <div className="space-y-6">
                  <div>
                    <h1 className="font-display text-3xl font-bold text-white">Visão Geral</h1>
                    <p className="text-sm text-zinc-400 mt-1">
                      Resumo em tempo real do cardápio publicado da {overview.settings.store_name}.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-[#141418] border border-white/10 p-5">
                      <p className="text-xs text-zinc-400">Produtos cadastrados</p>
                      <p className="font-mono text-3xl font-bold text-white tabular-nums mt-2">
                        {overview.stats.totalProducts}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#141418] border border-white/10 p-5">
                      <p className="text-xs text-zinc-400">Categorias</p>
                      <p className="font-mono text-3xl font-bold text-white tabular-nums mt-2">
                        {overview.stats.totalCategories}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#141418] border border-white/10 p-5">
                      <p className="text-xs text-zinc-400">Produtos ativos</p>
                      <p className="font-mono text-3xl font-bold text-emerald-400 tabular-nums mt-2">
                        {overview.stats.activeProducts}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#141418] border border-white/10 p-5">
                      <p className="text-xs text-zinc-400">Indisponíveis / inativos</p>
                      <p className="font-mono text-3xl font-bold text-amber-400 tabular-nums mt-2">
                        {overview.stats.unavailableProducts}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#141418] border border-white/10 p-5 space-y-4">
                    <h2 className="text-base font-semibold text-white">Atalhos rápidos</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setTab('products');
                          openNewProduct();
                        }}
                        className="min-h-[48px] px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Novo produto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('categories')}
                        className="min-h-[48px] px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-sm font-medium text-white transition-colors cursor-pointer"
                      >
                        Gerenciar categorias
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('addons')}
                        className="min-h-[48px] px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-sm font-medium text-white transition-colors cursor-pointer"
                      >
                        Gerenciar adicionais
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('settings')}
                        className="min-h-[48px] px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-sm font-medium text-white transition-colors cursor-pointer"
                      >
                        Configurar loja & WhatsApp
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: PRODUCTS */}
              {tab === 'products' && overview && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="font-display text-3xl font-bold text-white">Produtos</h1>
                      <p className="text-sm text-zinc-400">
                        Cadastre, edite preços, fotos, disponibilidade e adicionais vinculados.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openNewProduct}
                      className="min-h-[46px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Novo produto</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <button
                      type="button"
                      onClick={() => setProductFilterCat(0)}
                      className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                        productFilterCat === 0
                          ? 'bg-red-600 text-white'
                          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      Todos ({overview.products.length})
                    </button>
                    {overview.categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setProductFilterCat(cat.id)}
                        className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                          productFilterCat === cat.id
                            ? 'bg-red-600 text-white'
                            : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {filteredProducts.map((product) => (
                      <div
                        key={product.id}
                        className="rounded-2xl bg-[#141418] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-4 min-w-0">
                          <SafeFoodImage
                            src={product.image_url}
                            alt={product.name}
                            className="w-20 h-20 rounded-xl object-cover shrink-0 border border-white/10"
                          />
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs text-zinc-400">
                              {product.category_name}
                              {product.featured ? ' · Destaque' : ''}
                              {product.is_demo ? ' · Exemplo' : ''}
                            </p>
                            <h3 className="text-base font-semibold text-white truncate">{product.name}</h3>
                            <p className="font-mono text-sm font-semibold text-red-400 tabular-nums">
                              {formatCurrency(product.price)}
                            </p>
                            <p className="text-xs text-zinc-400 line-clamp-1">{product.description}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void toggleProductQuick(product, 'available')}
                            className={`min-h-[38px] px-3 rounded-lg text-xs font-medium border cursor-pointer ${
                              product.available
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            }`}
                          >
                            {product.available ? 'Disponível' : 'Indisponível'}
                          </button>

                          <button
                            type="button"
                            onClick={() => void toggleProductQuick(product, 'active')}
                            className={`min-h-[38px] px-3 rounded-lg text-xs font-medium border cursor-pointer ${
                              product.active
                                ? 'bg-zinc-900 border-white/15 text-zinc-200'
                                : 'bg-zinc-950 border-white/5 text-zinc-500'
                            }`}
                          >
                            {product.active ? 'Ativo' : 'Oculto'}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditProduct(product)}
                            className="min-h-[38px] px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-white inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({ kind: 'product', id: product.id, label: product.name })
                            }
                            aria-label={`Excluir ${product.name}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-red-600/20 border border-white/10 text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: CATEGORIES */}
              {tab === 'categories' && overview && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="font-display text-3xl font-bold text-white">Categorias</h1>
                      <p className="text-sm text-zinc-400">
                        Organize a ordem de exibição e gerencie as seções do cardápio.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(null);
                        setCatForm({ name: '', description: '', active: true });
                        setCatModalOpen(true);
                      }}
                      className="min-h-[46px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Nova categoria</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {overview.categories.map((cat, idx) => (
                      <div
                        key={cat.id}
                        className="rounded-2xl bg-[#141418] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-zinc-500">#{idx + 1}</span>
                            <h3 className="text-base font-semibold text-white">{cat.name}</h3>
                            <span className="text-xs text-zinc-400">
                              · {cat.active ? 'Ativa' : 'Oculta'}
                            </span>
                          </div>
                          {cat.description && (
                            <p className="text-xs text-zinc-400 mt-1">{cat.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => void moveCategory(idx, -1)}
                            aria-label="Mover para cima"
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-zinc-900 border border-white/10 text-zinc-300 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === overview.categories.length - 1}
                            onClick={() => void moveCategory(idx, 1)}
                            aria-label="Mover para baixo"
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-zinc-900 border border-white/10 text-zinc-300 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategory(cat);
                              setCatForm({ name: cat.name, description: cat.description, active: cat.active });
                              setCatModalOpen(true);
                            }}
                            className="min-h-[38px] px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-white inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({ kind: 'category', id: cat.id, label: cat.name })
                            }
                            aria-label={`Excluir ${cat.name}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-red-600/20 border border-white/10 text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: ADDONS */}
              {tab === 'addons' && overview && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="font-display text-3xl font-bold text-white">Adicionais</h1>
                      <p className="text-sm text-zinc-400">
                        Cadastre opções extras e vincule aos produtos na aba de Produtos.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAddon(null);
                        setAddonForm({ name: '', price: '', active: true });
                        setAddonModalOpen(true);
                      }}
                      className="min-h-[46px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Novo adicional</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {overview.addons.map((addon) => (
                      <div
                        key={addon.id}
                        className="rounded-2xl bg-[#141418] border border-white/10 p-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-white">{addon.name}</h3>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            <span className="font-mono text-red-400 tabular-nums">
                              {formatCurrency(addon.price)}
                            </span>
                            {' · '}
                            {addon.active ? 'Ativo' : 'Inativo'}
                            {' · '}
                            {addon.product_count || 0} produto(s)
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAddon(addon);
                              setAddonForm({
                                name: addon.name,
                                price: addon.price.toFixed(2),
                                active: addon.active,
                              });
                              setAddonModalOpen(true);
                            }}
                            className="min-h-[38px] px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-white cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({ kind: 'addon', id: addon.id, label: addon.name })
                            }
                            aria-label={`Excluir ${addon.name}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-red-600/20 border border-white/10 text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: SETTINGS */}
              {tab === 'settings' && settingsForm && (
                <form onSubmit={handleSaveSettings} className="space-y-6">
                  <div>
                    <h1 className="font-display text-3xl font-bold text-white">Configurações da Hamburgueria</h1>
                    <p className="text-sm text-zinc-400 mt-1">
                      Todas as alterações são salvas no banco de dados e refletem imediatamente no cardápio público.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#141418] border border-white/10 p-5 space-y-4">
                    <h2 className="text-base font-semibold text-white">Identidade & Contato</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                          Nome do estabelecimento
                        </label>
                        <input
                          type="text"
                          required
                          value={settingsForm.store_name}
                          onChange={(e) => setSettingsForm({ ...settingsForm, store_name: e.target.value })}
                          className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                          WhatsApp (apenas DDD + número)
                        </label>
                        <input
                          type="text"
                          required
                          value={settingsForm.whatsapp_number}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, whatsapp_number: e.target.value })
                          }
                          placeholder="3173391048"
                          className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Logo (URL ou envie um arquivo)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={settingsForm.logo_url}
                          onChange={(e) => setSettingsForm({ ...settingsForm, logo_url: e.target.value })}
                          placeholder="Opcional — deixe vazio para usar o emblema padrão"
                          className="flex-1 min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                        />
                        <label className="min-h-[44px] px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer shrink-0">
                          <Upload className="w-4 h-4" />
                          <span>Enviar</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                void handleImageFileUpload(file, (url) =>
                                  setSettingsForm((prev) => (prev ? { ...prev, logo_url: url } : prev)),
                                );
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                          Endereço
                        </label>
                        <input
                          type="text"
                          value={settingsForm.address}
                          onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                          className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                          Horários de funcionamento
                        </label>
                        <input
                          type="text"
                          value={settingsForm.opening_hours}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, opening_hours: e.target.value })
                          }
                          className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                          Informações de contato
                        </label>
                        <input
                          type="text"
                          value={settingsForm.contact_info}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, contact_info: e.target.value })
                          }
                          className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                          Taxa de entrega (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settingsForm.delivery_fee}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              delivery_fee: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#141418] border border-white/10 p-5 space-y-5">
                    <div>
                      <h2 className="text-base font-semibold text-white">Status e Horários de Funcionamento</h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Define se a hamburgueria aparece como Aberta ou Fechada para os clientes.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(
                        [
                          { id: 'auto', label: 'Automático (pelo horário)' },
                          { id: 'open', label: 'Forçar Aberta agora' },
                          { id: 'closed', label: 'Forçar Fechada agora' },
                        ] as { id: StoreStatusMode; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setSettingsForm({ ...settingsForm, store_status_mode: opt.id })
                          }
                          className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                            settingsForm.store_status_mode === opt.id
                              ? 'bg-red-600/20 border-red-500 text-white'
                              : 'bg-zinc-900 border-white/10 text-zinc-300 hover:border-white/25'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {ORDERED_DAYS.map(({ key, label }) => {
                        const day = settingsForm.schedule?.[key] || {
                          enabled: false,
                          open: '18:30',
                          close: '23:30',
                        };
                        return (
                          <div
                            key={key}
                            className="rounded-xl bg-zinc-900/70 border border-white/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
                          >
                            <label className="inline-flex items-center gap-2.5 text-sm text-white min-w-[150px] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={day.enabled}
                                onChange={(e) =>
                                  setSettingsForm({
                                    ...settingsForm,
                                    schedule: {
                                      ...settingsForm.schedule,
                                      [key]: { ...day, enabled: e.target.checked },
                                    },
                                  })
                                }
                                className="w-4 h-4 accent-red-600"
                              />
                              <span>{label}</span>
                            </label>

                            {day.enabled ? (
                              <div className="flex items-center gap-2 text-xs text-zinc-300">
                                <span>Abre</span>
                                <input
                                  type="time"
                                  value={day.open}
                                  onChange={(e) =>
                                    setSettingsForm({
                                      ...settingsForm,
                                      schedule: {
                                        ...settingsForm.schedule,
                                        [key]: { ...day, open: e.target.value },
                                      },
                                    })
                                  }
                                  className="min-h-[36px] rounded-lg bg-zinc-950 border border-white/10 px-2.5 text-xs text-white font-mono"
                                />
                                <span>Fecha</span>
                                <input
                                  type="time"
                                  value={day.close}
                                  onChange={(e) =>
                                    setSettingsForm({
                                      ...settingsForm,
                                      schedule: {
                                        ...settingsForm.schedule,
                                        [key]: { ...day, close: e.target.value },
                                      },
                                    })
                                  }
                                  className="min-h-[36px] rounded-lg bg-zinc-950 border border-white/10 px-2.5 text-xs text-white font-mono"
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-zinc-500">Fechado neste dia</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#141418] border border-white/10 p-5 space-y-4">
                    <h2 className="text-base font-semibold text-white">Foto de Fundo do Topo</h2>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Imagem de fundo do topo
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={settingsForm.banner_image_url}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, banner_image_url: e.target.value })
                          }
                          className="flex-1 min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                        />
                        <label className="min-h-[44px] px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer shrink-0">
                          <Upload className="w-4 h-4" />
                          <span>Enviar</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                void handleImageFileUpload(file, (url) =>
                                  setSettingsForm((prev) =>
                                    prev ? { ...prev, banner_image_url: url } : prev,
                                  ),
                                );
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#141418] border border-white/10 p-5 space-y-4">
                    <h2 className="text-base font-semibold text-white">Formas de pagamento aceitas</h2>
                    <div className="flex flex-wrap gap-2">
                      {settingsForm.payment_methods.map((method) => (
                        <div
                          key={method}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-sm text-white"
                        >
                          <span>{method}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setSettingsForm({
                                ...settingsForm,
                                payment_methods: settingsForm.payment_methods.filter((m) => m !== method),
                              })
                            }
                            aria-label={`Remover ${method}`}
                            className="text-zinc-400 hover:text-red-400 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 max-w-md">
                      <input
                        type="text"
                        value={newPaymentMethod}
                        onChange={(e) => setNewPaymentMethod(e.target.value)}
                        placeholder="Ex: Vale Refeição"
                        className="flex-1 min-h-[42px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newPaymentMethod.trim();
                          if (trimmed && !settingsForm.payment_methods.includes(trimmed)) {
                            setSettingsForm({
                              ...settingsForm,
                              payment_methods: [...settingsForm.payment_methods, trimmed],
                            });
                            setNewPaymentMethod('');
                          }
                        }}
                        className="min-h-[42px] px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white cursor-pointer"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={uploadingImage}
                      className="min-h-[48px] px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
                    >
                      {uploadingImage ? 'Enviando imagem...' : 'Salvar configurações'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB: SECURITY */}
              {tab === 'security' && (
                <form
                  onSubmit={handleChangePassword}
                  className="max-w-lg rounded-2xl bg-[#141418] border border-white/10 p-6 space-y-4"
                >
                  <div>
                    <h1 className="font-display text-3xl font-bold text-white">Alterar Senha</h1>
                    <p className="text-sm text-zinc-400 mt-1">
                      Atualize sua senha de acesso ao painel administrativo.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Senha atual
                    </label>
                    <input
                      type="password"
                      required
                      value={pwdForm.currentPassword}
                      onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                      className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Nova senha (mínimo 8 caracteres)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={pwdForm.newPassword}
                      onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                      className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Confirmar nova senha
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={pwdForm.confirmPassword}
                      onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                      className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="min-h-[46px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold cursor-pointer"
                  >
                    Atualizar senha
                  </button>
                </form>
              )}
            </>
          )}
        </main>
      </div>

      {/* MODAL: PRODUCT CREATE / EDIT */}
      {productModalOpen && overview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setProductModalOpen(false)}
        >
          <form
            onSubmit={handleSaveProduct}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#141418] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-white">
                {editingProduct ? 'Editar Produto' : 'Cadastrar Produto'}
              </h2>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Nome do produto *
                  </label>
                  <input
                    type="text"
                    required
                    value={prodForm.name}
                    onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Categoria *
                  </label>
                  <select
                    required
                    value={prodForm.category_id}
                    onChange={(e) => setProdForm({ ...prodForm, category_id: Number(e.target.value) })}
                    className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
                  >
                    {overview.categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Preço (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    value={prodForm.price}
                    onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                    placeholder="29.90"
                    className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Fotografia (URL ou envie do computador)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={prodForm.image_url}
                      onChange={(e) => setProdForm({ ...prodForm, image_url: e.target.value })}
                      placeholder="/uploads/... ou https://..."
                      className="flex-1 min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3 text-sm text-white"
                    />
                    <label className="min-h-[44px] px-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                      <Upload className="w-4 h-4" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleImageFileUpload(file, (url) =>
                              setProdForm((prev) => ({ ...prev, image_url: url })),
                            );
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Descrição
                </label>
                <textarea
                  rows={2}
                  value={prodForm.description}
                  onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                  className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { key: 'featured', label: 'Produto destaque' },
                  { key: 'active', label: 'Ativo no cardápio' },
                  { key: 'available', label: 'Disponível hoje' },
                  { key: 'is_demo', label: 'Marcar como exemplo' },
                ].map((opt) => {
                  const checked = Boolean(prodForm[opt.key as keyof typeof prodForm]);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() =>
                        setProdForm((prev) => ({
                          ...prev,
                          [opt.key]: !prev[opt.key as keyof typeof prev],
                        }))
                      }
                      className={`min-h-[42px] px-3 rounded-xl border text-xs font-medium flex items-center gap-2 cursor-pointer ${
                        checked
                          ? 'bg-red-600/20 border-red-500 text-white'
                          : 'bg-zinc-900 border-white/10 text-zinc-400'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border ${
                          checked ? 'bg-red-600 border-red-500 text-white' : 'border-zinc-600'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <div>
                <span className="block text-xs font-semibold text-zinc-300 mb-2">
                  Adicionais permitidos para este produto
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {overview.addons.map((addon) => {
                    const checked = prodForm.addon_ids.includes(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        onClick={() =>
                          setProdForm((prev) => ({
                            ...prev,
                            addon_ids: checked
                              ? prev.addon_ids.filter((id) => id !== addon.id)
                              : [...prev.addon_ids, addon.id],
                          }))
                        }
                        className={`min-h-[42px] px-3 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer ${
                          checked
                            ? 'bg-red-600/15 border-red-500/60 text-white'
                            : 'bg-zinc-900 border-white/10 text-zinc-300'
                        }`}
                      >
                        <span className="truncate">{addon.name}</span>
                        <span className="font-mono text-red-400 tabular-nums shrink-0">
                          + {formatCurrency(addon.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="min-h-[44px] px-4 rounded-xl border border-white/15 text-sm text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploadingImage}
                className="min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white cursor-pointer"
              >
                {uploadingImage ? 'Enviando foto...' : 'Salvar produto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CATEGORY */}
      {catModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setCatModalOpen(false)}
        >
          <form
            onSubmit={handleSaveCategory}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#141418] border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-display text-2xl font-bold text-white">
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </h2>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Nome *</label>
              <input
                type="text"
                required
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Descrição</label>
              <input
                type="text"
                value={catForm.description}
                onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                checked={catForm.active}
                onChange={(e) => setCatForm({ ...catForm, active: e.target.checked })}
                className="w-4 h-4 accent-red-600"
              />
              Categoria visível no cardápio
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-white/15 text-sm text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADDON */}
      {addonModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setAddonModalOpen(false)}
        >
          <form
            onSubmit={handleSaveAddon}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#141418] border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-display text-2xl font-bold text-white">
              {editingAddon ? 'Editar Adicional' : 'Novo Adicional'}
            </h2>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Nome *</label>
              <input
                type="text"
                required
                value={addonForm.name}
                onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                placeholder="Ex: Bacon extra"
                className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Preço (R$) *</label>
              <input
                type="text"
                required
                value={addonForm.price}
                onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })}
                placeholder="5.00"
                className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 px-3.5 text-sm text-white font-mono"
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                checked={addonForm.active}
                onChange={(e) => setAddonForm({ ...addonForm, active: e.target.checked })}
                className="w-4 h-4 accent-red-600"
              />
              Adicional ativo
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddonModalOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-white/15 text-sm text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DELETE CONFIRM */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#141418] border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-white">Confirmar exclusão</h2>
            <p className="text-sm text-zinc-300">
              Tem certeza que deseja excluir <strong className="text-white">{deleteConfirm.label}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="min-h-[42px] px-4 rounded-xl border border-white/15 text-sm text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="min-h-[42px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { initDb, requestPersistence, warmUp } from './db';
import { applyUpdate, getAppState, useAppState } from './appState';
import { useHashRoute, go } from './router';
import { HomeScreen } from './screens/HomeScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { MoreScreen } from './screens/MoreScreen';
import { AccountsScreen } from './screens/AccountsScreen';
import { OperationForm } from './components/OperationForm';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { ShoppingScreen } from './screens/ShoppingScreen';
import { ShopListScreen } from './screens/ShopListScreen';
import { CatalogScreen } from './screens/CatalogScreen';
import { logEvent } from './diagStore';
import { formatMs } from './diagnostics';

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const app = useAppState();
  const route = useHashRoute();
  const [page] = route;

  useEffect(() => {
    initDb()
      .then(() => setReady(true))
      .catch((e) => setError(String(e)));
    requestPersistence();
  }, []);

  // BA-008: при возврате в приложение — запись в журнал и «разогрев» базы до нажатия «Сохранить».
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt) {
        logEvent(`возврат в приложение после ${formatMs(Date.now() - hiddenAt)} в фоне`);
        if (!getAppState().dbStale) warmUp();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (error) return <div class="empty">Ошибка базы данных: {error}</div>;
  if (!ready) {
    return (
      <div class="loading">
        Загрузка…
        {app.dbBlocked && <p>База занята другой копией приложения. Закройте другие окна и вкладки «Бюджета».</p>}
      </div>
    );
  }

  let screen;
  if (page === 'transactions') screen = <TransactionsScreen key={route.join('/')} initialMonth={route[1]} initialCategory={route[2]} />;
  else if (page === 'reports') screen = <ReportsScreen />;
  else if (page === 'more') screen = <MoreScreen />;
  else if (page === 'accounts') screen = <AccountsScreen />;
  else if (page === 'diag') screen = <DiagnosticsScreen />;
  else if (page === 'categories') screen = <CategoriesScreen />;
  else if (page === 'shop' && route[1]) screen = <ShopListScreen key={route[1]} id={Number(route[1])} />;
  else if (page === 'shop') screen = <ShoppingScreen />;
  else if (page === 'catalog') screen = <CatalogScreen />;
  else screen = <HomeScreen />;

  /** Какая вкладка подсвечена для экрана. */
  const GROUP: Record<string, string> = {
    home: 'home',
    transactions: 'transactions',
    reports: 'reports',
    shop: 'shop',
    catalog: 'shop',
    more: 'more',
    accounts: 'more',
    diag: 'more',
    categories: 'more'
  };
  const tab = GROUP[page] ?? 'home';
  const nav: [string, string][] = [
    ['home', 'Главная'],
    ['transactions', 'Операции'],
    ['reports', 'Отчёты'],
    ['shop', 'Покупки'],
    ['more', 'Ещё']
  ];

  /** Кнопка «+» — на «Главной» и «Операциях» (decisions.md п. 24, BA-002). */
  const showFab = tab === 'home' || tab === 'transactions';

  return (
    <>
      {app.dbStale ? (
        <div class="app-banner warn">
          <span>Приложение обновилось в другом окне. Перезапустите его, чтобы работать с новой версией.</span>
          <button class="chip accent" onClick={() => location.reload()}>
            Перезапустить
          </button>
        </div>
      ) : (
        app.updateReady && (
          <div class="app-banner">
            <span>Доступна новая версия.</span>
            <button class="chip accent" onClick={applyUpdate}>
              Обновить
            </button>
          </div>
        )
      )}
      <main>{screen}</main>
      {showFab && (
        <button class="fab" onClick={() => setAdding(true)} aria-label="Новая операция">
          +
        </button>
      )}
      {adding && <OperationForm onClose={() => setAdding(false)} />}
      <nav class="tabbar">
        {nav.map(([k, l]) => (
          <button class={tab === k ? 'on' : ''} onClick={() => go(k)}>
            {l}
          </button>
        ))}
      </nav>
    </>
  );
}

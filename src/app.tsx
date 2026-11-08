import { useEffect, useState } from 'preact/hooks';
import { initDb, requestPersistence } from './db';
import { useHashRoute, go } from './router';
import { HomeScreen } from './screens/HomeScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { MoreScreen } from './screens/MoreScreen';
import { AccountsScreen } from './screens/AccountsScreen';
import { OperationForm } from './components/OperationForm';

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const route = useHashRoute();
  const [page] = route;

  useEffect(() => {
    initDb()
      .then(() => setReady(true))
      .catch((e) => setError(String(e)));
    requestPersistence();
  }, []);

  if (error) return <div class="empty">Ошибка базы данных: {error}</div>;
  if (!ready) return <div class="loading">Загрузка…</div>;

  let screen;
  if (page === 'transactions') screen = <TransactionsScreen />;
  else if (page === 'reports') screen = <ReportsScreen />;
  else if (page === 'more') screen = <MoreScreen />;
  else if (page === 'accounts') screen = <AccountsScreen />;
  else screen = <HomeScreen />;

  /** Какая вкладка подсвечена для экрана. */
  const GROUP: Record<string, string> = {
    home: 'home',
    transactions: 'transactions',
    reports: 'reports',
    more: 'more',
    accounts: 'more'
  };
  const tab = GROUP[page] ?? 'home';
  const nav: [string, string][] = [
    ['home', 'Главная'],
    ['transactions', 'Операции'],
    ['reports', 'Отчёты'],
    ['more', 'Ещё']
  ];

  /** Кнопка «+» — на «Главной» и «Операциях» (decisions.md п. 24, BA-002). */
  const showFab = tab === 'home' || tab === 'transactions';

  return (
    <>
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

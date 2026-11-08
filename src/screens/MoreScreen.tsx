import { go } from '../router';
import { BackupCard } from '../components/BackupCard';

export function MoreScreen() {
  return (
    <div class="screen">
      <div class="screen-head">
        <h1>Ещё</h1>
      </div>
      <section class="card">
        <button class="list-row" onClick={() => go('accounts')}>
          <span class="row-main">
            <span class="row-title">Счета</span>
            <span class="muted small">Добавить, изменить, архив</span>
          </span>
          <span class="muted">›</span>
        </button>
        <button class="list-row" onClick={() => go('diag')}>
          <span class="row-main">
            <span class="row-title">Диагностика</span>
            <span class="muted small">Скорость сохранения, журнал для разработчика</span>
          </span>
          <span class="muted">›</span>
        </button>
      </section>
      <BackupCard />
      <p class="muted small center">Бюджет · версия 0.3.0</p>
    </div>
  );
}

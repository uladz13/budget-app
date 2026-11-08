import { go } from '../router';

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
      </section>
      <p class="muted small center">Бюджет · версия 0.1.0</p>
    </div>
  );
}

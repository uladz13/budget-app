import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { setAppState, setUpdater } from './appState';
import { logEvent } from './diagStore';
import './styles.css';

// Новая версия не перезагружает страницу сама (decisions.md п. 31): показываем плашку,
// без нажатия «Обновить» она применится при следующем запуске приложения.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    logEvent('найдена новая версия приложения');
    setAppState({ updateReady: true });
  }
});
setUpdater(() => {
  logEvent('обновление: применяется по кнопке');
  updateSW(true);
});

render(<App />, document.getElementById('app')!);

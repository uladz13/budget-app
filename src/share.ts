/**
 * Сохранение файла (браузерные API — изолированно, с проверкой поддержки).
 * Телефон: системное меню «Поделиться» (Диск, Telegram, Файлы…). Компьютер: обычное скачивание —
 * Chrome на Windows тоже умеет «делиться» файлами, но там ждут окно сохранения (правка после BA-012).
 * Без поддержки «Поделиться» или при ошибке — скачивание.
 */

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/** Телефон или планшет: по User-Agent Client Hints, иначе по строке браузера. */
function isMobileDevice(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof nav.userAgentData?.mobile === 'boolean') return nav.userAgentData.mobile;
  return isIOS() || /Android|Mobile/i.test(navigator.userAgent);
}

/** iPhone / iPad (iPadOS выдаёт себя за Mac, но с сенсорным экраном). */
export function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/** Открыто как приложение с экрана «Домой» (а не во вкладке браузера). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

const IOS_HINT_KEY = 'budget-app:ios-home-hint-closed';

/**
 * Показывать ли подсказку «Добавьте на экран «Домой»» (BA-015, п. 3): iPhone / iPad, открыто в Safari
 * (не с экрана «Домой») и подсказку ещё не закрывали на этом устройстве.
 */
export function needIosHomeHint(): boolean {
  if (!isIOS() || isStandalone()) return false;
  try {
    return localStorage.getItem(IOS_HINT_KEY) !== '1';
  } catch {
    return true;
  }
}

export function closeIosHomeHint(): void {
  try {
    localStorage.setItem(IOS_HINT_KEY, '1');
  } catch {
    /* хранилище недоступно — подсказка покажется снова, не страшно */
  }
}

/**
 * Ограничение типов для выбора файла. На iOS не ограничиваем: «Файлы» иногда делают `.json` / `.csv`
 * недоступными для выбора; неподходящий файл приложение и так отклонит с понятной ошибкой (BA-015).
 */
export function fileAccept(types: string): string | undefined {
  return isIOS() ? undefined : types;
}

export async function saveTextFile(name: string, text: string, type = 'application/json'): Promise<SaveResult> {
  const blob = new Blob([text], { type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (isMobileDevice() && typeof File === 'function' && nav.canShare && navigator.share) {
    const file = new File([blob], name, { type });
    if (nav.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return 'shared';
      } catch (e) {
        // Пользователь закрыл меню — ничего не сохраняем; иные ошибки (нет жеста и т. п.) — скачиваем.
        if ((e as Error)?.name === 'AbortError') return 'cancelled';
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

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
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
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

/**
 * Сохранение файла на телефоне (браузерные API — изолированно, с проверкой поддержки).
 * Android: системное меню «Поделиться» (Диск, Telegram, Файлы…); без поддержки — обычное скачивание.
 */

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

export async function saveTextFile(name: string, text: string, type = 'application/json'): Promise<SaveResult> {
  const blob = new Blob([text], { type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof File === 'function' && nav.canShare && navigator.share) {
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

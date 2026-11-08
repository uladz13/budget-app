import { useEffect, useState } from 'preact/hooks';

/** Маршрут из адреса после `#/`: `accounts/5` → ['accounts', '5']. */
export function useHashRoute(): string[] {
  const parse = () => (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string) {
  location.hash = '#/' + path;
}

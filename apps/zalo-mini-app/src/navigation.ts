import { useSyncExternalStore } from "react";

const routes = {
  welcome: "#/",
  unregistered: "#/chua-dang-ky",
  register: "#/dang-ky",
  balance: "#/so-du",
  profile: "#/ho-so",
} as const;

export type Page = keyof typeof routes;
const pageChange = "my-bduck:page-change";

function readPage(): Page {
  return (
    (Object.keys(routes) as Page[]).find(
      (page) => routes[page] === window.location.hash,
    ) ?? "welcome"
  );
}

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  window.addEventListener(pageChange, listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
    window.removeEventListener(pageChange, listener);
  };
}

export function usePage() {
  return useSyncExternalStore(subscribe, readPage);
}

export function navigate(page: Page, replace = false) {
  if (window.location.hash === routes[page]) return;
  const state = {
    ...window.history.state,
    myBduckPreviousPage: replace ? window.history.state?.myBduckPreviousPage : readPage(),
  };
  if (replace) window.history.replaceState(state, "", routes[page]);
  else window.history.pushState(state, "", routes[page]);
  window.dispatchEvent(new Event(pageChange));
}

export function goBackTo(page: Page) {
  if (window.history.state?.myBduckPreviousPage === page) {
    window.history.back();
  } else {
    navigate(page, true);
  }
}

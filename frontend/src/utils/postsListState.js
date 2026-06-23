/** Query params persisted when leaving /posts and restored on return. */
export const POSTS_LIST_PARAM_KEYS = [
  'page',
  'status',
  'media_type',
  'date',
  'sort',
  'order',
  'page_num',
  'view',
];

const SCROLL_KEY = 'autopost_posts_scroll';

export function pickPostsListParams(searchParams) {
  const next = new URLSearchParams();
  for (const key of POSTS_LIST_PARAM_KEYS) {
    const value = searchParams.get(key);
    if (value) next.set(key, value);
  }
  return next;
}

export function postsListPath(searchParams) {
  const query = pickPostsListParams(searchParams).toString();
  return query ? `/posts?${query}` : '/posts';
}

export function postsSubPath(path, searchParams, extraParams = {}) {
  const next = pickPostsListParams(searchParams);
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined && value !== null && value !== '') next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}

export function postsListView(searchParams) {
  return searchParams.get('view') === 'grid' ? 'grid' : 'table';
}

export function savePostsListScroll() {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  } catch {
    // ignore quota / private mode
  }
}

export function restorePostsListScroll() {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw == null) return false;
    sessionStorage.removeItem(SCROLL_KEY);
    const y = parseInt(raw, 10);
    if (Number.isFinite(y)) {
      window.scrollTo(0, y);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

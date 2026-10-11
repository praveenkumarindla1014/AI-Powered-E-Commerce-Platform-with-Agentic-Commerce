// Visual identity for each catalog category (icon + tile colour).
const CATEGORY_STYLES = {
  electronics: { icon: '🎧', label: 'Electronics', bg: 'linear-gradient(135deg, #DCEBFF, #B9D5FF)' },
  gaming: { icon: '🎮', label: 'Gaming', bg: 'linear-gradient(135deg, #EDE4FF, #D3C2FF)' },
  fashion: { icon: '👗', label: 'Fashion', bg: 'linear-gradient(135deg, #FFE1EA, #FFC2D3)' },
  health: { icon: '🩺', label: 'Health', bg: 'linear-gradient(135deg, #DDF7E6, #B8EDCB)' },
  home: { icon: '🏠', label: 'Home', bg: 'linear-gradient(135deg, #FFF0D6, #FFDCA3)' },
  beauty: { icon: '💄', label: 'Beauty', bg: 'linear-gradient(135deg, #FFE3F4, #FFC4E6)' },
  fragrances: { icon: '🌸', label: 'Fragrances', bg: 'linear-gradient(135deg, #F7E6FF, #E8C8FF)' },
  furniture: { icon: '🛋️', label: 'Furniture', bg: 'linear-gradient(135deg, #F3EADF, #E3D0B8)' },
  groceries: { icon: '🛒', label: 'Groceries', bg: 'linear-gradient(135deg, #E6F8D9, #C9EEAF)' },
};

const FALLBACK = { icon: '🛍️', bg: 'linear-gradient(135deg, #EEF1F6, #DCE2EC)' };

export function categoryStyle(category) {
  const style = CATEGORY_STYLES[category] || FALLBACK;
  return { ...style, label: style.label || category.replace(/-/g, ' ') };
}

export const FEATURED_CATEGORIES = ['electronics', 'gaming', 'fashion', 'health', 'home'];

import { DARK_THEME, setTheme, type Theme } from '@phaser-mvvm/phaser';

/**
 * 「刺客终端」主题：墨黑底、宣纸白字、鎏金主色、朱红警示。
 * 竖屏设计宽 720，所以字号/控件高都比框架默认值大一档。
 */
export const AVM_THEME: Theme = {
  ...DARK_THEME,
  name: 'avm-ink',
  colors: {
    ...DARK_THEME.colors,
    background: 0x05060a,
    surface: 0x10131c,
    surfaceAlt: 0x171b27,
    surfaceHover: 0x202536,
    overlay: 0x020307,
    primary: 0xd8b76a,
    primaryHover: 0xe9cc86,
    primaryPressed: 0xb8954b,
    onPrimary: 0x0a0b10,
    text: 0xf2efe6,
    textMuted: 0x9b9486,
    textDisabled: 0x5b564c,
    border: 0x3a3428,
    borderStrong: 0x6b5a36,
    focusRing: 0xf0d79a,
    danger: 0xc0392b,
    success: 0x3fb950,
    warning: 0xd29922,
  },
  fontFamily: '"PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif',
  // 设计宽 720 会缩到手机 ~390 CSS px（约 0.54），所以字号按 2 倍左右设计。
  fontSize: { xs: 18, sm: 22, md: 26, lg: 34, xl: 48 },
  spacing: { xs: 6, sm: 10, md: 16, lg: 24, xl: 36 },
  radius: { sm: 0, md: 3, lg: 6, pill: 999 },
  controlHeight: { sm: 56, md: 68, lg: 84 },
  borderWidth: 1,
  focusRingWidth: 2,
  motion: { enter: 220, exit: 160 },
};

export function applyTheme(): void {
  setTheme(AVM_THEME);
}

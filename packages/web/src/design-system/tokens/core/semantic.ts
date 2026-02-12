/**
 * Semantic Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const semanticTokens = {
  light: {
  "content": {
    "primary": "#34373C",
    "secondary": "#A0ABB4",
    "tertiary": "#B5BCC4",
    "accent": "#F3F1FC",
    "subtle": "#EEE9FE",
    "disabled": "#B5BCC4",
    "positive": "#16A34A",
    "negative": "#DC2626",
    "warning": "#D97706",
    "info": "#6137F3"
  },
  "surface": {
    "primary": "#FFFFFF",
    "secondary": "#F7F8F9",
    "tertiary": "#E8EAED",
    "accent": "#4F26E4",
    "accent-subtle": "#F3F1FC"
  },
  "border": {
    "primary": "#D8DDE0",
    "elevantion": "rgba(9, 9, 11, 0.3)"
  },
  "control": {
    "bg": "#FFFFFF",
    "content-placeholder": "{Semantic.content.tertiary}",
    "content": "{Semantic.content.primary}",
    "border-active": "#6137F3",
    "focusring": "#2563EB"
  },
  "elevation": {
    "first-level": "rgba(9, 9, 11, 0.05)"
  },
  "gradient": {
    "primary": {
      "stop-0": "{Semantic.surface.primary}",
      "stop-78": "{Semantic.surface.primary}",
      "stop-100": "rgba(255, 255, 255, 0.8)"
    }
  }
},
  dark: {
  "content": {
    "primary": "#F7F8F9",
    "secondary": "#B5BCC4",
    "tertiary": "#A0ABB4",
    "accent": "#F3F1FC",
    "subtle": "#EEE9FE",
    "disabled": "#34373C",
    "positive": "#4ADE80",
    "negative": "#F87171",
    "warning": "#FBBF24",
    "info": "#8D6EF7"
  },
  "surface": {
    "primary": "#18181B",
    "secondary": "#34373C",
    "tertiary": "#596269",
    "accent": "#4F26E4",
    "accent-subtle": "#160F2B"
  },
  "border": {
    "primary": "#34373C",
    "elevantion": "rgba(9, 9, 11, 0.3)"
  },
  "control": {
    "bg": "{Semantic.surface.primary}",
    "content-placeholder": "{Semantic.content.tertiary}",
    "content": "{Semantic.content.primary}",
    "border-active": "#7048F5",
    "focusring": "#1D4ED8"
  },
  "elevation": {
    "first-level": "rgba(255, 255, 255, 0.05)"
  },
  "gradient": {
    "primary": {
      "stop-0": "{Semantic.surface.primary}",
      "stop-78": "{Semantic.surface.primary}",
      "stop-100": "rgba(9, 9, 11, 0.8)"
    }
  }
},
} as const;

export const componentTokens = {
  light: {
  "badge": {
    "bg-default": "{Semantic.surface.secondary}",
    "bg-disabled": "#E8EAED",
    "content-disabled": "{Semantic.content.disabled}",
    "bg-hover": "{Semantic.surface.tertiary}",
    "content-hover": "{Semantic.content.primary}",
    "content": "{Semantic.content.primary}"
  },
  "button": {
    "bg-disabled": "#E8EAED",
    "content-disabled": "{Semantic.content.disabled}",
    "shortcut": "rgba(255, 255, 255, 0.8)",
    "primary": {
      "bg-default": "{Semantic.surface.accent}",
      "bg-hover": "#3812B7",
      "bg-active": "#4F26E4",
      "content-default": "#FFFFFF",
      "content-hover": "#FFFFFF",
      "content-active": "#FFFFFF"
    },
    "destructive": {
      "bg-default": "#B91C1C",
      "bg-hover": "#991B1B",
      "bg-active": "#7F1D1D",
      "content-default": "#FFFFFF",
      "content-hover": "#FFFFFF",
      "content-active": "#FFFFFF"
    },
    "secondary": {
      "bg-default": "rgba(255, 255, 255, 0.1)",
      "bg-hover": "#E8EAED",
      "bg-active": "#EEE9FE",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "#8A97A2",
      "content-active": "#6137F3",
      "border-active": "#8D6EF7"
    },
    "ghost": {
      "bg-default": "rgba(255, 255, 255, 0)",
      "bg-hover": "#E8EAED",
      "bg-active": "#F7F8F9",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "#8A97A2",
      "content-active": "#596269"
    }
  },
  "calendar": {
    "arrow-button": {
      "bg": "rgba(255, 255, 255, 0)",
      "bg-hover": "#EEE9FE",
      "content": "{Semantic.content.primary}",
      "content-hover": "#6137F3"
    },
    "day-button": {
      "bg-default": "rgba(255, 255, 255, 0)",
      "bg-hover": "#EEE9FE",
      "bg-pressed": "#E8EAED",
      "bg-disabled": "#E8EAED",
      "bg-selected": "#6137F3",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "#6137F3",
      "content-pressed": "#A0ABB4",
      "content-disabled": "{Semantic.content.disabled}",
      "content-selected": "#F3F1FC",
      "current-bg-default": "#E8EAED",
      "current-content-default": "#757F88"
    }
  },
  "control-bar": {
    "bg-default": "#18181B",
    "bg-active": "#18181B",
    "tab-content": "{Semantic.content.subtle}",
    "tab-bg-default": "rgba(255, 255, 255, 0)",
    "tab-bg-active": "rgba(255, 255, 255, 0.1)",
    "tab-bg-hover": "rgba(255, 255, 255, 0.05)",
    "button-bg-disabled": "#34373C",
    "button-content-disabled": "#757F88",
    "close-button-bg": "rgba(255, 255, 255, 0)",
    "close-button-content": "{Semantic.content.accent}",
    "border": "#34373C"
  },
  "chip": {
    "bg-disabled": "#E8EAED",
    "content-disabled": "{Semantic.content.disabled}",
    "bg-default": "rgba(255, 255, 255, 0)",
    "bg-hover": "#E8EAED",
    "bg-active": "#EEE9FE",
    "content-active": "#6137F3",
    "content-hover": "#8A97A2",
    "border-active": "#DED4FD"
  },
  "googlebutton": {
    "bg-default": "{Semantic.surface.primary}",
    "bg-hover": "{Semantic.surface.tertiary}",
    "content-default": "{Semantic.content.primary}",
    "content-hover": "{Semantic.content.primary}"
  },
  "list-item": {
    "bg-disabled": "rgba(255, 255, 255, 0)",
    "content-disabled": "{Semantic.content.disabled}",
    "bg-default": "rgba(255, 255, 255, 0)",
    "bg-hover": "#F7F8F9",
    "bg-active": "#F3F1FC",
    "content-hover": "{Semantic.content.primary}",
    "content-active": "{Semantic.content.info}",
    "counter": {
      "bg-default": "{Semantic.surface.secondary}",
      "content-default": "{Semantic.content.primary}",
      "bg-hover": "rgba(9, 9, 11, 0.05)",
      "content-hover": "{Semantic.content.primary}",
      "bg-active": "#6137F3",
      "content-active": "{Semantic.content.subtle}",
      "bg-disabled": "rgba(255, 255, 255, 0)",
      "content-disabled": "{Semantic.content.disabled}"
    }
  },
  "logo": {
    "bg-default": "#18181B",
    "content-stop-1": "#FFFFFF",
    "content-stop-2": "#EEE9FE"
  },
  "dialog": {
    "bg-overlay": "rgba(9, 9, 11, 0.3)"
  },
  "quick-task-creator": {
    "bg-default": "{Semantic.surface.tertiary}",
    "bg-hover": "#6137F3",
    "border-default": "rgba(9, 9, 11, 0.05)",
    "border-hover": "#6137F3",
    "icon-default": "{Semantic.content.secondary}",
    "icon-hover": "{Semantic.content.accent}",
    "content": "{Semantic.content.secondary}",
    "content-hover": "{Semantic.content.primary}"
  },
  "tooltip": {
    "bg": "#18181B",
    "content": "{Semantic.content.accent}"
  }
},
  dark: {
  "badge": {
    "bg-default": "{Semantic.surface.secondary}",
    "bg-disabled": "#18181B",
    "content-disabled": "{Semantic.content.disabled}",
    "bg-hover": "{Semantic.surface.tertiary}",
    "content-hover": "{Semantic.content.primary}",
    "content": "{Semantic.content.primary}"
  },
  "button": {
    "bg-disabled": "#34373C",
    "content-disabled": "#757F88",
    "shortcut": "rgba(255, 255, 255, 0.8)",
    "primary": {
      "bg-default": "{Semantic.surface.accent}",
      "bg-hover": "#3812B7",
      "bg-active": "#4F26E4",
      "content-default": "#FFFFFF",
      "content-hover": "#FFFFFF",
      "content-active": "#FFFFFF"
    },
    "destructive": {
      "bg-default": "#DC2626",
      "bg-hover": "#B91C1C",
      "bg-active": "#991B1B",
      "content-default": "#FFFFFF",
      "content-hover": "#FFFFFF",
      "content-active": "#FFFFFF"
    },
    "secondary": {
      "bg-default": "rgba(9, 9, 11, 0.1)",
      "bg-hover": "#34373C",
      "bg-active": "#1D1440",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "{Semantic.content.primary}",
      "content-active": "#8D6EF7",
      "border-active": "#4F26E4"
    },
    "ghost": {
      "bg-default": "rgba(255, 255, 255, 0)",
      "bg-hover": "#34373C",
      "bg-active": "#34373C",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "{Semantic.content.secondary}",
      "content-active": "#D8DDE0"
    }
  },
  "calendar": {
    "arrow-button": {
      "bg": "rgba(255, 255, 255, 0)",
      "bg-hover": "#3730A3",
      "content": "{Semantic.content.primary}",
      "content-hover": "#DED4FD"
    },
    "day-button": {
      "bg-default": "rgba(255, 255, 255, 0)",
      "bg-hover": "#3812B7",
      "bg-pressed": "#34373C",
      "bg-disabled": "#34373C",
      "bg-selected": "#4F26E4",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "#DED4FD",
      "content-pressed": "#F3F1FC",
      "content-disabled": "#757F88",
      "content-selected": "#F3F1FC",
      "current-bg-default": "#34373C",
      "current-content-default": "#C7CDD3"
    }
  },
  "control-bar": {
    "bg-default": "#34373C",
    "bg-active": "#18181B",
    "tab-content": "{Semantic.content.subtle}",
    "tab-bg-default": "rgba(255, 255, 255, 0)",
    "tab-bg-active": "rgba(255, 255, 255, 0.1)",
    "tab-bg-hover": "rgba(255, 255, 255, 0.05)",
    "button-bg-disabled": "#34373C",
    "button-content-disabled": "#757F88",
    "close-button-bg": "rgba(255, 255, 255, 0)",
    "close-button-content": "{Semantic.content.accent}",
    "border": "#34373C"
  },
  "chip": {
    "bg-disabled": "#18181B",
    "content-disabled": "{Semantic.content.disabled}",
    "bg-default": "rgba(255, 255, 255, 0)",
    "bg-hover": "#34373C",
    "bg-active": "#1D1440",
    "content-active": "#8D6EF7",
    "content-hover": "{Semantic.content.primary}",
    "border-active": "#6137F3"
  },
  "googlebutton": {
    "bg-default": "{Semantic.surface.primary}",
    "bg-hover": "{Semantic.surface.secondary}",
    "content-default": "{Semantic.content.primary}",
    "content-hover": "{Semantic.content.primary}"
  },
  "list-item": {
    "bg-disabled": "rgba(255, 255, 255, 0)",
    "content-disabled": "{Semantic.content.disabled}",
    "bg-default": "rgba(255, 255, 255, 0)",
    "bg-hover": "rgba(255, 255, 255, 0.05)",
    "bg-active": "#3812B7",
    "content-hover": "{Semantic.content.primary}",
    "content-active": "#EEE9FE",
    "counter": {
      "bg-default": "{Semantic.surface.secondary}",
      "content-default": "{Semantic.content.primary}",
      "bg-hover": "rgba(255, 255, 255, 0.05)",
      "content-hover": "{Semantic.content.primary}",
      "bg-active": "#4F26E4",
      "content-active": "#EEE9FE",
      "bg-disabled": "rgba(255, 255, 255, 0)",
      "content-disabled": "{Semantic.content.disabled}"
    }
  },
  "logo": {
    "bg-default": "{Semantic.surface.accent}",
    "content-stop-1": "#FFFFFF",
    "content-stop-2": "#EEE9FE"
  },
  "dialog": {
    "bg-overlay": "rgba(9, 9, 11, 0.6)"
  },
  "quick-task-creator": {
    "bg-default": "rgba(255, 255, 255, 0.05)",
    "bg-hover": "#8D6EF7",
    "border-default": "rgba(9, 9, 11, 0.05)",
    "border-hover": "#8D6EF7",
    "icon-default": "{Semantic.content.secondary}",
    "icon-hover": "{Semantic.content.accent}",
    "content": "{Semantic.content.tertiary}",
    "content-hover": "{Semantic.content.primary}"
  },
  "tooltip": {
    "bg": "#F9FAFA",
    "content": "#18181B"
  }
},
} as const;

export type ThemeMode = 'light' | 'dark';
export type SemanticCategory = keyof typeof semanticTokens.light;

/**
 * Semantic Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const semanticTokens = {
  light: {
  "content": {
    "primary": "#18191B",
    "secondary": "#4B5058",
    "tertiary": "#A0A8B4",
    "accent": "#F3F1FC",
    "subtle": "#EEE9FE",
    "disabled": "rgba(9, 9, 11, 0.15)",
    "positive": "#16A34A",
    "negative": "#DC2626",
    "warning": "#D97706",
    "info": "#6137F3"
  },
  "surface": {
    "primary": "#FFFFFF",
    "secondary": "#EEEFF2",
    "tertiary": "#F9F9FA",
    "accent": "#4F26E4",
    "accent-subtle": "#F3F1FC"
  },
  "border": {
    "primary": "#D8DBE0",
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
    "primary": "#EEEFF2",
    "secondary": "#B5BBC4",
    "tertiary": "#A0A8B4",
    "accent": "#F3F1FC",
    "subtle": "#EEE9FE",
    "disabled": "rgba(255, 255, 255, 0.2)",
    "positive": "#4ADE80",
    "negative": "#F87171",
    "warning": "#FBBF24",
    "info": "#8D6EF7"
  },
  "surface": {
    "primary": "#18191B",
    "secondary": "#2B2D31",
    "tertiary": "#4B5058",
    "accent": "#4F26E4",
    "accent-subtle": "#160F2B"
  },
  "border": {
    "primary": "#2B2D31",
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
    "bg-disabled": "rgba(9, 9, 11, 0.05)",
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
      "content-hover": "#8A94A2",
      "content-active": "#6137F3",
      "border-active": "#8D6EF7"
    },
    "ghost": {
      "bg-default": "rgba(255, 255, 255, 0)",
      "bg-hover": "#E8EAED",
      "bg-active": "#EEEFF2",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "#8A94A2",
      "content-active": "#4B5058"
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
      "content-pressed": "#A0A8B4",
      "content-disabled": "{Semantic.content.disabled}",
      "content-selected": "#F3F1FC",
      "current-bg-default": "#E8EAED",
      "current-content-default": "#757D88"
    }
  },
  "control-bar": {
    "bg-default": "#18191B",
    "bg-active": "#18191B",
    "tab-content": "{Semantic.content.subtle}",
    "tab-bg-default": "rgba(255, 255, 255, 0)",
    "tab-bg-active": "rgba(255, 255, 255, 0.1)",
    "tab-bg-hover": "rgba(255, 255, 255, 0.05)",
    "button-bg-disabled": "#2B2D31",
    "button-content-disabled": "#757D88",
    "close-button-bg": "rgba(255, 255, 255, 0)",
    "close-button-content": "{Semantic.content.accent}",
    "border": "#2B2D31"
  },
  "chip": {
    "bg-disabled": "#E8EAED",
    "content-disabled": "{Semantic.content.disabled}",
    "bg-default": "rgba(255, 255, 255, 0)",
    "bg-hover": "#E8EAED",
    "bg-active": "#EEE9FE",
    "bg-default-outline": "#E4E5E9",
    "content-active": "#6137F3",
    "content-hover": "#8A94A2",
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
    "bg-hover": "#EEEFF2",
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
    "bg-default": "#18191B",
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
  "sidebar-group-header": {
    "bg-default": "rgba(255, 255, 255, 0)",
    "bg-hover": "{Semantic.surface.tertiary}",
    "button": {
      "bg-default": "rgba(255, 255, 255, 0)",
      "bg-hover": "{Semantic.surface.secondary}"
    }
  },
  "tooltip": {
    "bg": "#18191B",
    "content": "{Semantic.content.accent}"
  }
},
  dark: {
  "badge": {
    "bg-default": "{Semantic.surface.secondary}",
    "bg-disabled": "#18191B",
    "content-disabled": "{Semantic.content.disabled}",
    "bg-hover": "{Semantic.surface.tertiary}",
    "content-hover": "{Semantic.content.primary}",
    "content": "{Semantic.content.primary}"
  },
  "button": {
    "bg-disabled": "rgba(255, 255, 255, 0.05)",
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
      "bg-default": "#DC2626",
      "bg-hover": "#B91C1C",
      "bg-active": "#991B1B",
      "content-default": "#FFFFFF",
      "content-hover": "#FFFFFF",
      "content-active": "#FFFFFF"
    },
    "secondary": {
      "bg-default": "rgba(9, 9, 11, 0.1)",
      "bg-hover": "#2B2D31",
      "bg-active": "#1D1440",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "{Semantic.content.primary}",
      "content-active": "#8D6EF7",
      "border-active": "#4F26E4"
    },
    "ghost": {
      "bg-default": "rgba(255, 255, 255, 0)",
      "bg-hover": "#2B2D31",
      "bg-active": "#2B2D31",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "{Semantic.content.secondary}",
      "content-active": "#D8DBE0"
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
      "bg-pressed": "#2B2D31",
      "bg-disabled": "#2B2D31",
      "bg-selected": "#4F26E4",
      "content-default": "{Semantic.content.primary}",
      "content-hover": "#DED4FD",
      "content-pressed": "#F3F1FC",
      "content-disabled": "#757D88",
      "content-selected": "#F3F1FC",
      "current-bg-default": "#2B2D31",
      "current-content-default": "#C7CCD3"
    }
  },
  "control-bar": {
    "bg-default": "#2B2D31",
    "bg-active": "#18191B",
    "tab-content": "{Semantic.content.subtle}",
    "tab-bg-default": "rgba(255, 255, 255, 0)",
    "tab-bg-active": "rgba(255, 255, 255, 0.1)",
    "tab-bg-hover": "rgba(255, 255, 255, 0.05)",
    "button-bg-disabled": "#2B2D31",
    "button-content-disabled": "#757D88",
    "close-button-bg": "rgba(255, 255, 255, 0)",
    "close-button-content": "{Semantic.content.accent}",
    "border": "#2B2D31"
  },
  "chip": {
    "bg-disabled": "#18191B",
    "content-disabled": "{Semantic.content.disabled}",
    "bg-default": "rgba(255, 255, 255, 0)",
    "bg-hover": "#2B2D31",
    "bg-active": "#1D1440",
    "bg-default-outline": "#2B2D31",
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
  "sidebar-group-header": {
    "bg-default": "rgba(255, 255, 255, 0)",
    "bg-hover": "{Semantic.surface.secondary}",
    "button": {
      "bg-default": "rgba(255, 255, 255, 0)",
      "bg-hover": "{Semantic.surface.tertiary}"
    }
  },
  "tooltip": {
    "bg": "#F9F9FA",
    "content": "#18191B"
  }
},
} as const;

export type ThemeMode = 'light' | 'dark';
export type SemanticCategory = keyof typeof semanticTokens.light;

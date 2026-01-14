/**
 * Semantic Tokens
 * Generated from Figma
 * DO NOT EDIT MANUALLY
 */

export const semanticTokens = {
  light: {
  "content": {
    "content-primary": "#34373C",
    "content-secondary": "#A0ABB4",
    "content-tertiary": "#B5BCC4",
    "content-accent": "#F3F1FC",
    "content-subtle": "#EEE9FE",
    "content-disabled": "#B5BCC4",
    "content-positive": "#16A34A",
    "content-negative": "#DC2626",
    "content-warning": "#D97706",
    "content-info": "#6137F3"
  },
  "surface": {
    "surface-primary": "#FFFFFF",
    "surface-secondary": "#F7F8F9",
    "surface-tertiary": "#E8EAED",
    "surface-accent": "#4F26E4",
    "surface-accent-subtle": "#F3F1FC"
  },
  "borders": {
    "border": "#D8DDE0"
  },
  "control": {
    "control-bg": "#FFFFFF",
    "control-content-placeholder": "{Semantic.content.content-tertiary}",
    "control-content": "{Semantic.content.content-primary}",
    "control-border-active": "#6137F3",
    "control-focusring": "#2563EB"
  },
  "elevation": {
    "elevation-base": "#09090B",
    "elevation-spread": "#09090B"
  }
},
  dark: {
  "content": {
    "content-primary": "#F7F8F9",
    "content-secondary": "#B5BCC4",
    "content-tertiary": "#A0ABB4",
    "content-accent": "#F3F1FC",
    "content-subtle": "#EEE9FE",
    "content-disabled": "#34373C",
    "content-positive": "#4ADE80",
    "content-negative": "#F87171",
    "content-warning": "#FBBF24",
    "content-info": "#8D6EF7"
  },
  "surface": {
    "surface-primary": "#18181B",
    "surface-secondary": "#34373C",
    "surface-tertiary": "#596269",
    "surface-accent": "#4F26E4",
    "surface-accent-subtle": "#160F2B"
  },
  "borders": {
    "border": "#34373C"
  },
  "control": {
    "control-bg": "{Semantic.surface.surface-primary}",
    "control-content-placeholder": "{Semantic.content.content-tertiary}",
    "control-content": "{Semantic.content.content-primary}",
    "control-border-active": "#7048F5",
    "control-focusring": "#1D4ED8"
  },
  "elevation": {
    "elevation-base": "#FFFFFF",
    "elevation-spread": "#FFFFFF"
  }
},
} as const;

export const componentTokens = {
  light: {
  "button": {
    "bg-disabled": "#E8EAED",
    "content-disabled": "{Semantic.content.content-disabled}",
    "primary": {
      "bg-default": "{Semantic.surface.surface-accent}",
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
      "bg-default": "#FFFFFF",
      "bg-hover": "#E8EAED",
      "bg-active": "#EEE9FE",
      "content-default": "{Semantic.content.content-primary}",
      "content-hover": "#8A97A2",
      "content-active": "#6137F3",
      "border-active": "#DED4FD"
    },
    "ghost": {
      "bg-default": "#FFFFFF",
      "bg-hover": "#E8EAED",
      "bg-active": "#F7F8F9",
      "content-default": "{Semantic.content.content-primary}",
      "content-hover": "#8A97A2",
      "content-active": "#596269"
    }
  },
  "calendar": {
    "arrow-button": {
      "bg": "#FFFFFF",
      "bg-hover": "#EEE9FE",
      "content": "{Semantic.content.content-primary}",
      "content-hover": "#6137F3"
    },
    "day-button": {
      "bg-default": "#FFFFFF",
      "bg-hover": "#EEE9FE",
      "bg-pressed": "#E8EAED",
      "bg-disabled": "#E8EAED",
      "bg-selected": "#6137F3",
      "content-default": "{Semantic.content.content-primary}",
      "content-hover": "#6137F3",
      "content-pressed": "#A0ABB4",
      "content-disabled": "{Semantic.content.content-disabled}",
      "content-selected": "#F3F1FC",
      "current-bg-default": "#E8EAED",
      "current-content-default": "#757F88"
    }
  },
  "control-bar": {
    "bg-default": "#18181B",
    "bg-active": "#18181B",
    "border": "#34373C"
  },
  "chip": {
    "bg-disabled": "#E8EAED",
    "content-disabled": "{Semantic.content.content-disabled}",
    "bg-default": "#FFFFFF",
    "bg-hover": "#E8EAED",
    "bg-active": "#EEE9FE",
    "content-active": "#6137F3",
    "content-hover": "#8A97A2",
    "border-active": "#DED4FD"
  },
  "list-item": {
    "bg-disabled": "#FFFFFF",
    "content-disabled": "{Semantic.content.content-disabled}",
    "bg-default": "#FFFFFF",
    "bg-hover": "#F7F8F9",
    "bg-active": "#F3F1FC",
    "content-hover": "{Semantic.content.content-primary}",
    "content-active": "#3812B7"
  },
  "dialog": {
    "bg-overlay": "#09090B"
  }
},
  dark: {
  "button": {
    "bg-disabled": "#34373C",
    "content-disabled": "#757F88",
    "primary": {
      "bg-default": "{Semantic.surface.surface-accent}",
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
      "bg-default": "#09090B",
      "bg-hover": "#34373C",
      "bg-active": "#1D1440",
      "content-default": "{Semantic.content.content-primary}",
      "content-hover": "{Semantic.content.content-primary}",
      "content-active": "#8D6EF7",
      "border-active": "#4F26E4"
    },
    "ghost": {
      "bg-default": "#FFFFFF",
      "bg-hover": "#34373C",
      "bg-active": "#34373C",
      "content-default": "{Semantic.content.content-primary}",
      "content-hover": "{Semantic.content.content-secondary}",
      "content-active": "#D8DDE0"
    }
  },
  "calendar": {
    "arrow-button": {
      "bg": "#FFFFFF",
      "bg-hover": "#3730A3",
      "content": "{Semantic.content.content-disabled}",
      "content-hover": "#DED4FD"
    },
    "day-button": {
      "bg-default": "#FFFFFF",
      "bg-hover": "#3812B7",
      "bg-pressed": "#34373C",
      "bg-disabled": "#34373C",
      "bg-selected": "#4F26E4",
      "content-default": "{Semantic.content.content-primary}",
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
    "border": "#18181B"
  },
  "chip": {
    "bg-disabled": "#18181B",
    "content-disabled": "{Semantic.content.content-disabled}",
    "bg-default": "#FFFFFF",
    "bg-hover": "#34373C",
    "bg-active": "#1D1440",
    "content-active": "#8D6EF7",
    "content-hover": "{Semantic.content.content-primary}",
    "border-active": "#6137F3"
  },
  "list-item": {
    "bg-disabled": "#FFFFFF",
    "content-disabled": "{Semantic.content.content-disabled}",
    "bg-default": "#FFFFFF",
    "bg-hover": "#18181B",
    "bg-active": "#4F26E4",
    "content-hover": "{Semantic.content.content-primary}",
    "content-active": "#EEE9FE"
  },
  "dialog": {
    "bg-overlay": "#09090B"
  }
},
} as const;

export type ThemeMode = 'light' | 'dark';
export type SemanticCategory = keyof typeof semanticTokens.light;

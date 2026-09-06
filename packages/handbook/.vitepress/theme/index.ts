import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import BugBashTracker from '../../../../docs/bug-bash/BugBashTracker.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('BugBashTracker', BugBashTracker);
  },
} satisfies Theme;

/**
 * MindStep — Type-safe i18n dictionary schema.
 *
 * Every locale's message JSON (en/ar/fr/zh) MUST conform to this `Dictionary`
 * interface. If a key is missing or has the wrong shape, TypeScript will fail
 * at compile time (`tsc --noEmit`). The runtime check is also enforced by
 * `tests/i18n-completeness.test.ts` which iterates every leaf key across all
 * 4 locales.
 *
 * Design rules:
 *  - Nested structures are encouraged (group by domain — see §4 of Prompt 03).
 *  - Leaf values are strings, sometimes containing ICU placeholders
 *    (`{name}`, `{count, plural, ...}`).
 *  - NEVER use `Record<string, string>` as the only typing — that hides
 *    missing keys. Always derive from this interface.
 *
 * When you add a new key:
 *   1. Add it here (to `Dictionary`).
 *   2. Add it to all four `src/i18n/messages/*.json` files.
 *   3. Run `bunx tsc --noEmit` — must still pass.
 *   4. Run `bunx vitest run` — the i18n-completeness test must still pass.
 */

export interface Dictionary {
  app: {
    name: string;
    tagline: string;
    description: string;
  };

  nav: {
    dashboard: string;
    tasks: string;
    projects: string;
    brainDump: string;
    focus: string;
    planner: string;
    calendar: string;
    habits: string;
    life: string;
    sleep: string;
    energy: string;
    insights: string;
    ai: string;
    family: string;
    professional: string;
    reports: string;
    settings: string;
    notifications: string;
    piAccount: string;
    privacy: string;
    help: string;
    bottomNav: {
      home: string;
      tasks: string;
      focus: string;
      planner: string;
      ai: string;
    };
    group: {
      core: string;
      productivity: string;
      focus: string;
      adhdSupport: string;
      life: string;
      ai: string;
      family: string;
      professional: string;
    };
  };

  common: {
    loading: string;
    empty: string;
    error: string;
    retry: string;
    save: string;
    saved: string;
    cancel: string;
    delete: string;
    edit: string;
    close: string;
    create: string;
    add: string;
    search: string;
    all: string;
    today: string;
    tomorrow: string;
    yesterday: string;
    thisWeek: string;
    more: string;
    less: string;
    yes: string;
    no: string;
    back: string;
    next: string;
    previous: string;
    start: string;
    continue: string;
    open: string;
    keep: string;
    move: string;
    drop: string;
    done: string;
    of: string;
    or: string;
    /** Pluralized — accepts {count}. */
    items: string;
  };

  theme: {
    light: string;
    dark: string;
    system: string;
    toggle: string;
    label: string;
  };

  language: {
    label: string;
    english: string;
    arabic: string;
    french: string;
    chinese: string;
    /** Announcement used by the live region when the locale changes. */
    changed: string;
  };

  accessibility: {
    skipToMain: string;
    openNavigation: string;
    closeNavigation: string;
    navigationLandmark: string;
    quickActionsToolbar: string;
    mainContent: string;
    currentPage: string;
    /** Used by ProgressRing to announce percentage. */
    progress: string;
  };

  dashboard: {
    hero: {
      greeting: {
        morning: string;
        afternoon: string;
        evening: string;
        night: string;
      };
      whatMattersNow: string;
      subtitle: string;
      aiHint: string;
    };
    sections: {
      adhdSupport: string;
      adhdSupportDescription: string;
      nextStep: string;
      nextStepDescription: string;
      brainDump: string;
      brainDumpDescription: string;
      focus: string;
      focusDescription: string;
      todayRhythm: string;
      todayRhythmDescription: string;
      topPriorities: string;
      topPrioritiesDescription: string;
      reminders: string;
      remindersDescription: string;
      progress: string;
      progressDescription: string;
      energyCheck: string;
      energyCheckDescription: string;
    };
    adhdCards: {
      iCantStart: { title: string; description: string };
      oneStep: { title: string; description: string };
      resetMyDay: { title: string; description: string };
      minimumViableDay: { title: string; description: string };
      whereWasI: { title: string; description: string };
      overwhelmMode: { title: string; description: string };
    };
    stats: {
      tasksDone: string;
      focusMinutes: string;
      streak: string;
      brainDumps: string;
      energy: string;
    };
    empty: {
      noTasks: string;
      noFocus: string;
      noReminders: string;
    };
  };

  signature: {
    iCantStart: {
      title: string;
      step1Title: string;
      step1Body: string;
      step1Action: string;
      step2Title: string;
      step2Body: string;
      step2Placeholder: string;
      step3Title: string;
      step3Body: string;
      step3Placeholder: string;
      step4Title: string;
      step4Body: string;
      step4Action: string;
      skipFocus: string;
      success: string;
    };
    resetMyDay: {
      title: string;
      subtitle: string;
      keep: string;
      move: string;
      drop: string;
      keepHint: string;
      moveHint: string;
      dropHint: string;
      summary: {
        title: string;
        kept: string;
        moved: string;
        dropped: string;
      };
      apply: string;
      empty: string;
    };
    startFocus: {
      title: string;
      subtitle: string;
      pickTask: string;
      orFreelance: string;
      freelancePlaceholder: string;
      duration: string;
      presets: {
        quick5: string;
        focus15: string;
        focus25: string;
        focus45: string;
        focus90: string;
      };
      begin: string;
      openFullFocus: string;
    };
    quickCapture: {
      title: string;
      subtitle: string;
      placeholder: string;
      save: string;
      saved: string;
      shortcut: string;
    };
  };

  tasks: {
    title: string;
    subtitle: string;
    add: string;
    placeholder: string;
    empty: string;
    fields: {
      title: string;
      description: string;
      notes: string;
      priority: string;
      energy: string;
      due: string;
      dueTime: string;
      project: string;
      milestone: string;
      estimate: string;
      tags: string;
    };
    priority: { low: string; normal: string; high: string; urgent: string };
    energy: { low: string; medium: string; high: string };
    /** New task lifecycle per Prompt 04 §2 */
    status: {
      inbox: string;
      planned: string;
      in_progress: string;
      completed: string;
      archived: string;
    };
    breakdown: string;
    markDone: string;
    markUndone: string;
    startFocus: string;
    overdue: string;
    subtasks: string;
    /** ICU placeholder {done}/{total}. */
    subtaskCount: string;
    /** Pluralized summary — accepts {count}. */
    count: string;
    filters: {
      all: string;
      today: string;
      overdue: string;
      completed: string;
      snoozed: string;
      archived: string;
    };
    sort: {
      label: string;
      manual: string;
      due: string;
      priority: string;
      created: string;
      updated: string;
    };
    search: {
      label: string;
      placeholder: string;
      empty: string;
      clear: string;
    };
    estimatePresets: {
      "5": string;
      "10": string;
      "15": string;
      "25": string;
      "30": string;
      "45": string;
      "60": string;
      custom: string;
    };
    detail: {
      title: string;
      openTask: string;
      edit: string;
      save: string;
      cancel: string;
      addSubtask: string;
      subtaskPlaceholder: string;
      deleteSubtask: string;
      completeSubtask: string;
      uncompleteSubtask: string;
      moveUp: string;
      moveDown: string;
      archive: string;
      unarchive: string;
      convertToTask: string;
      convertToReminder: string;
    };
    confirmDelete: {
      title: string;
      description: string;
      confirm: string;
    };
    progress: {
      label: string;
      value: string;
      noSubtasks: string;
    };
  };

  subtasks: {
    title: string;
    add: string;
    empty: string;
    markDone: string;
    markUndone: string;
    delete: string;
    reorder: string;
    moveUp: string;
    moveDown: string;
    count: string;
    completedCount: string;
  };

  projects: {
    title: string;
    subtitle: string;
    add: string;
    empty: string;
    fields: {
      name: string;
      description: string;
      color: string;
    };
    detail: {
      title: string;
      tasks: string;
      completedTasks: string;
      activeTasks: string;
      milestones: string;
      noTasks: string;
      addTask: string;
      progress: string;
    };
    status: {
      active: string;
      completed: string;
      archived: string;
    };
    confirmDelete: {
      title: string;
      description: string;
      confirm: string;
    };
    count: string;
  };

  milestones: {
    title: string;
    subtitle: string;
    add: string;
    empty: string;
    fields: {
      name: string;
      description: string;
      due: string;
    };
    detail: {
      title: string;
      progress: string;
      tasks: string;
      noTasks: string;
      complete: string;
      reopen: string;
    };
    status: {
      active: string;
      completed: string;
      archived: string;
    };
    confirmDelete: {
      title: string;
      description: string;
      confirm: string;
    };
    count: string;
  };

  brainDump: {
    title: string;
    subtitle: string;
    placeholder: string;
    add: string;
    empty: string;
    categorize: string;
    categories: {
      task: string;
      idea: string;
      reminder: string;
      uncategorized: string;
    };
    /** Pluralized — accepts {count}. */
    count: string;
    convert: {
      toTask: string;
      toReminder: string;
      title: string;
      taskTitleLabel: string;
      priorityLabel: string;
      projectLabel: string;
      dueLabel: string;
      remindAtLabel: string;
      confirm: string;
      cancel: string;
      success: string;
      alreadyConverted: string;
    };
    status: {
      inbox: string;
      converted: string;
      archived: string;
    };
  };

  breakdown: {
    title: string;
    subtitle: string;
    trigger: string;
    suggest: string;
    sourceDisclosure: string;
    edit: string;
    delete: string;
    addStep: string;
    approve: string;
    cancel: string;
    empty: string;
    approved: string;
    noChanges: string;
  };

  focus: {
    title: string;
    subtitle: string;
    startSession: string;
    endFocus: string;
    pause: string;
    resume: string;
    stop: string;
    complete: string;
    duration: string;
    justFive: string;
    distractionCapture: string;
    distractionPlaceholder: string;
    captureDistraction: string;
    distractionSaved: string;
    interruptions: string;
    sessionActive: string;
    sessionPaused: string;
    sessionComplete: string;
    sessionEnded: string;
    noTask: string;
    timerComplete: string;
    preset: {
      focus5: string;
      focus10: string;
      focus15: string;
      focus25: string;
      focus30: string;
      focus45: string;
      focus60: string;
      focus90: string;
    };
    /** Pluralized — accepts {count}. */
    interruptionsCount: string;
    welcomeBack: {
      title: string;
      body: string;
      continue: string;
      endSession: string;
      chooseAnother: string;
    };
    whereWasI: {
      title: string;
      noRecentSession: string;
      lastSession: string;
      lastDistraction: string;
      nextStep: string;
    };
    completion: {
      title: string;
      duration: string;
      whatDidYouDo: string;
      whatDidYouDoPlaceholder: string;
      done: string;
      startAnother: string;
      backToTasks: string;
    };
    overwhelm: {
      title: string;
      subtitle: string;
      step1: string;
      step1Placeholder: string;
      step2: string;
      step2Placeholder: string;
      step3: string;
      start: string;
    };
    oneStep: {
      title: string;
      subtitle: string;
      placeholder: string;
      start: string;
    };
    transition: {
      title: string;
      subtitle: string;
      ready: string;
      skip: string;
    };
    history: {
      title: string;
      today: string;
      thisWeek: string;
      thisMonth: string;
      empty: string;
      sessionLabel: string;
      taskLabel: string;
    };
    stats: {
      title: string;
      totalMinutes: string;
      totalSessions: string;
      completedSessions: string;
      averageSession: string;
      longestSession: string;
      byDay: string;
      byTask: string;
      noTaskFocus: string;
      minutes: string;
      sessions: string;
      empty: string;
      trendWeek: string;
      trendLongest: string;
    };
    aria: {
      timerStarted: string;
      timerPaused: string;
      timerResumed: string;
      timerCompleted: string;
      timerEnded: string;
      minutesRemaining: string;
      distractionCaptured: string;
    };
  };

  habits: {
    title: string;
    subtitle: string;
    add: string;
    empty: string;
    streak: string;
    fields: {
      name: string;
      cue: string;
      routine: string;
      reward: string;
    };
    /** Pluralized — accepts {count}. */
    streakCount: string;
  };

  energy: {
    title: string;
    subtitle: string;
    levels: { "1": string; "2": string; "3": string; "4": string; "5": string };
    levelDescription: {
      "1": string;
      "2": string;
      "3": string;
      "4": string;
      "5": string;
    };
    logged: string;
    viewHistory: string;
    today: string;
    empty: string;
    /** Pluralized — accepts {count}. */
    entriesCount: string;
  };

  reminders: {
    title: string;
    subtitle: string;
    empty: string;
    dueSoon: string;
    overdue: string;
    later: string;
    tomorrow: string;
    thisWeek: string;
    markDone: string;
    snooze: string;
    /** Pluralized — accepts {count}. */
    count: string;
  };

  progress: {
    title: string;
    subtitle: string;
    tasksCompleted: string;
    focusMinutes: string;
    habitsDone: string;
    captures: string;
    streak: string;
    streakDescription: string;
    motivations: {
      firstStep: string;
      momentum: string;
      going: string;
      rest: string;
    };
  };

  planner: {
    title: string;
    subtitle: string;
    day: string;
    week: string;
    today: string;
    tomorrow: string;
    schedule: string;
    timeBlock: string;
    routine: string;
    availability: string;
    conflicts: string;
    planMyDay: string;
    whatShouldIDoNow: string;
    empty: string;
    now: string;
    next: string;
    later: string;
    overloaded: string;
    overloadedDescription: string;
    unscheduled: string;
    buffer: string;
    available: string;
    planned: string;
    maxDaily: string;
    deadlines: string;
    blocks: string;
    generate: string;
    approve: string;
    regenerate: string;
    planSaved: string;
    planAlreadyApproved: string;
    nextBestAction: {
      continueFocus: string;
      startScheduled: string;
      startHighValue: string;
      startTiny: string;
      rest: string;
    };
    recover: {
      title: string;
      subtitle: string;
      analyze: string;
      generate: string;
    };
    move: {
      toTomorrow: string;
      toAnotherDay: string;
      toNextSlot: string;
    };
    missed: {
      title: string;
      continue: string;
      reschedule: string;
      makeSmaller: string;
      skip: string;
    };
    aria: {
      scheduleLoaded: string;
      planGenerated: string;
      planApproved: string;
      blockMoved: string;
    };
  };

  settings: {
    title: string;
    subtitle: string;
    sections: {
      appearance: string;
      appearanceDescription: string;
      language: string;
      languageDescription: string;
      accessibility: string;
      accessibilityDescription: string;
      focus: string;
      focusDescription: string;
      notifications: string;
      notificationsDescription: string;
      privacy: string;
      privacyDescription: string;
      ai: string;
      aiDescription: string;
      account: string;
      accountDescription: string;
    };
    options: {
      theme: string;
      reducedMotion: string;
      highContrast: string;
      textScale: string;
      language: string;
      focusLength: string;
      shortBreak: string;
      longBreak: string;
      dailyStart: string;
      dailyEnd: string;
      notificationsEnabled: string;
      aiCoachEnabled: string;
    };
    textScale: {
      small: string;
      normal: string;
      large: string;
      xlarge: string;
    };
    saved: string;
  };

  ai: {
    title: string;
    subtitle: string;
    disclaimer: string;
    placeholder: string;
    send: string;
    contexts: {
      general: string;
      task_breakdown: string;
      day_rebuilder: string;
      decision: string;
      overwhelm: string;
    };
    welcome: string;
    /** Live-region announcement while waiting for a reply. */
    thinking: string;
    retry: string;
    memory: string;
    memoryDescription: string;
    privacy: string;
    privacyDescription: string;
  };

  notifications: {
    title: string;
    empty: string;
    markAllRead: string;
    unread: string;
    read: string;
    dismiss: string;
    open: string;
    today: string;
    earlier: string;
    all: string;
    types: {
      task_due: string;
      task_overdue: string;
      focus_start: string;
      focus_end: string;
      planning_reminder: string;
      planned_task: string;
      missed_plan: string;
      recovery_suggestion: string;
      milestone: string;
      project: string;
      system: string;
      ai_nudge: string;
      focus_reminder: string;
      habit: string;
      ai_insight: string;
      // Prompt 10 — new notification domains
      habit_reminder: string;
      calendar_event: string;
      bill_due: string;
      routine_reminder: string;
    };
    settings: string;
    frequency: {
      label: string;
      minimal: string;
      balanced: string;
      more: string;
    };
    quietHours: {
      label: string;
      start: string;
      end: string;
      description: string;
    };
    budget: {
      label: string;
      description: string;
    };
    categories: {
      tasks: string;
      focus: string;
      planner: string;
      milestones: string;
      aiNudges: string;
      // Prompt 10 — new categories
      habits: string;
      calendar: string;
      bills: string;
      routines: string;
    };
    actions: {
      openTask: string;
      startFocus: string;
      openPlanner: string;
      reschedule: string;
      reviewPlan: string;
      dismiss: string;
      snooze: string;
      complete: string;
    };
    snooze: {
      "10min": string;
      "30min": string;
      "1hour": string;
      tomorrow: string;
      capped: string;
    };
    /** Action menu labels for smart reminder interactions (Prompt 10) */
    smartActions: {
      snoozeTitle: string;
      rescheduleTitle: string;
      completeTitle: string;
      dismissTitle: string;
      snoozeDescription: string;
      rescheduleDescription: string;
      completeDescription: string;
      dismissDescription: string;
    };
    /** Reschedule dialog (Prompt 10 — Smart Reminders) */
    reschedule: {
      title: string;
      description: string;
      newTime: string;
      pickTime: string;
      confirm: string;
      cancel: string;
      success: string;
      pastTime: string;
    };
    /** Snooze result messages (Prompt 10 — Smart Reminders) */
    snoozeResult: {
      success: string;
      capped: string;
      tomorrowScheduled: string;
    };
    /** Complete action messages (Prompt 10 — Smart Reminders) */
    completeResult: {
      success: string;
      taskCompleted: string;
      reminderCompleted: string;
      billPaid: string;
      habitMarkedDone: string;
    };
    unreadCount: string;
    refresh: string;
    aria: {
      notificationsLoaded: string;
      markedRead: string;
      markedAllRead: string;
      dismissed: string;
      snoozed: string;
      rescheduled: string;
      completed: string;
    };
  };

  // ============================================================
  // PWA, OFFLINE, NETWORK (Prompt 10)
  // ============================================================

  pwa: {
    /** Install prompt */
    install: {
      title: string;
      description: string;
      accept: string;
      dismiss: string;
      /** Shown in iOS Safari where beforeInstallPrompt is not supported */
      iosInstructions: string;
    };
    /** Service worker update flow */
    update: {
      title: string;
      description: string;
      action: string;
      dismiss: string;
    };
    /** Offline banner + transitions */
    offline: {
      banner: string; // "{count, plural, zero {You're offline. Changes will sync when you reconnect.} one {You're offline. # change is saved and will sync.} other {You're offline. # changes are saved and will sync.}}"
      toast: string;
      page: {
        title: string;
        body: string;
        retry: string;
      };
    };
    /** Syncing banner */
    syncing: {
      banner: string; // "{count, plural, one {Syncing # change…} other {Syncing # changes…}}"
    };
    /** Sync complete banner */
    synced: {
      banner: string;
    };
    /** Sync failed banner */
    failed: {
      banner: string;
      retry: string;
    };
    /** Online transition toast */
    online: {
      reconnected: string;
      reconnectedWithPending: string; // {count, plural, one {Back online — syncing # change.} other {Back online — syncing # changes.}}
    };
    /** Common "dismiss" label for banners */
    dismiss: string;
    /** Notification permission prompts */
    permissions: {
      title: string;
      body: string;
      accept: string;
      deny: string;
      denied: string;
      /** Shown when the user has denied permission in browser settings */
      enableInSettings: string;
    };
    /** Push subscription (multi-device) */
    push: {
      enabled: string;
      disabled: string;
      enable: string;
      disable: string;
      devicesLabel: string;
      addDevice: string;
      removeDevice: string;
    };
  };

  offline: {
    /** Sync management section */
    title: string;
    description: string;
    queueLabel: string;
    emptyQueue: string;
    pendingCount: string; // {count, plural, zero {No pending changes} one {# pending change} other {# pending changes}}
    retryAll: string;
    discardAll: string;
    discardConfirm: string;
    /** Conflict resolution */
    conflict: {
      title: string;
      description: string;
      keepMine: string;
      keepTheirs: string;
      reviewManually: string;
    };
  };

  auth: {
    signIn: {
      title: string;
      subtitle: string;
      email: string;
      password: string;
      submit: string;
      forgotPassword: string;
      noAccount: string;
      register: string;
    };
    register: {
      title: string;
      subtitle: string;
      displayName: string;
      email: string;
      password: string;
      confirmPassword: string;
      submit: string;
      haveAccount: string;
      signIn: string;
    };
    forgotPassword: {
      title: string;
      subtitle: string;
      email: string;
      submit: string;
      backToSignIn: string;
    };
    resetPassword: {
      title: string;
      subtitle: string;
      newPassword: string;
      confirmPassword: string;
      submit: string;
    };
    verification: {
      title: string;
      subtitle: string;
      code: string;
      submit: string;
      resend: string;
      resent: string;
    };
    errors: {
      invalidCredentials: string;
      emailExists: string;
      weakPassword: string;
      codeExpired: string;
      codeInvalid: string;
      tooManyAttempts: string;
    };
  };

  errors: {
    /** Generic catch-all. */
    unknown: string;
    network: string;
    server: string;
    notFound: string;
    unauthorized: string;
    forbidden: string;
    validation: string;
    rateLimited: string;
    consentRequired: string;
    featureDisabled: string;
    /** Title for error alerts. */
    title: string;
    /** Suggestion to retry. */
    retryAction: string;
    /** Map of stable server error codes to localized user-facing messages. */
    codes: {
      VALIDATION_ERROR: string;
      INVALID_INPUT: string;
      INVALID_LOCALE: string;
      UNAUTHORIZED: string;
      SESSION_EXPIRED: string;
      FORBIDDEN: string;
      NOT_OWNER: string;
      CONSENT_REQUIRED: string;
      FEATURE_DISABLED: string;
      NOT_FOUND: string;
      CONFLICT: string;
      DUPLICATE: string;
      BUSINESS_RULE_VIOLATION: string;
      RATE_LIMITED: string;
      INTERNAL_ERROR: string;
      DATABASE_ERROR: string;
      AI_SERVICE_ERROR: string;
      PI_SERVICE_ERROR: string;
    };
  };

  validation: {
    required: string;
    email: string;
    emailTaken: string;
    passwordTooShort: string;
    passwordTooLong: string;
    passwordMismatch: string;
    nameTooShort: string;
    nameTooLong: string;
    titleTooLong: string;
    notesTooLong: string;
    invalidDate: string;
    invalidTime: string;
    invalidUrl: string;
    invalidColor: string;
    numberOutOfRange: string;
    selectOption: string;
    /** Used when a generic "value too short" message is needed. */
    tooShort: string;
    tooLong: string;
  };

  emptyStates: {
    title: string;
    description: string;
    action: string;
    tasks: string;
    tasksDescription: string;
    focus: string;
    focusDescription: string;
    habits: string;
    habitsDescription: string;
    brainDump: string;
    brainDumpDescription: string;
    reminders: string;
    remindersDescription: string;
    notifications: string;
    notificationsDescription: string;
    energy: string;
    energyDescription: string;
    insights: string;
    insightsDescription: string;
  };

  loading: {
    /** Used by LoadingState label. */
    default: string;
    saving: string;
    fetching: string;
    sending: string;
    starting: string;
  };

  onboarding: {
    welcome: string;
    welcomeDescription: string;
    step1: string;
    step1Description: string;
    step2: string;
    step2Description: string;
    step3: string;
    step3Description: string;
    skip: string;
    finish: string;
  };

  privacy: {
    title: string;
    subtitle: string;
    principles: {
      dataIsYours: string;
      dataIsYoursDescription: string;
      noDarkPatterns: string;
      noDarkPatternsDescription: string;
      localFirst: string;
      localFirstDescription: string;
      noPassphrases: string;
      noPassphrasesDescription: string;
      strictOwnership: string;
      strictOwnershipDescription: string;
      calmByDesign: string;
      calmByDesignDescription: string;
    };
    dataRights: {
      title: string;
      description: string;
      export: string;
      exportDescription: string;
      delete: string;
      deleteDescription: string;
      withdrawConsent: string;
      withdrawConsentDescription: string;
      aiRetention: string;
      aiRetentionDescription: string;
    };
    /** Prompt 13 §Privacy — Privacy Center sections */
    center: {
      title: string;
      subtitle: string;
      dataExport: {
        title: string;
        description: string;
        button: string;
        success: string;
        failed: string;
      };
      deleteAIHistory: {
        title: string;
        description: string;
        button: string;
        confirm: string;
        success: string;
        failed: string;
      };
      deleteAccount: {
        title: string;
        description: string;
        button: string;
        confirm: string;
        confirmPlaceholder: string;
        warning: string;
        success: string;
        failed: string;
      };
      consentManagement: {
        title: string;
        description: string;
        terms: string;
        termsDescription: string;
        privacy: string;
        privacyDescription: string;
        ageConfirmed: string;
        ageConfirmedDescription: string;
        marketing: string;
        marketingDescription: string;
        dataProcessing: string;
        dataProcessingDescription: string;
        save: string;
        saved: string;
        withdrawAll: string;
        withdrawAllConfirm: string;
        withdrawn: string;
      };
      dataSharing: {
        title: string;
        description: string;
        aiCoach: string;
        aiCoachDescription: string;
        insights: string;
        insightsDescription: string;
        analytics: string;
        analyticsDescription: string;
        note: string;
      };
    };
    loading: string;
  };

  help: {
    crisisTitle: string;
    crisisBody: string;
    gettingStarted: string;
    gettingStartedDescription: string;
    adhdTips: string;
    adhdTipsDescription: string;
    beGentle: string;
    beGentleDescription: string;
    medicalDisclaimer: string;
    contact: string;
    contactDescription: string;
    bugReports: string;
    privacyEmail: string;
    securityReports: string;
  };

  comingSoon: {
    title: string;
    description: string;
    badge: string;
  };

  // ============================================================
  // PERSONAL INSIGHTS (Prompt 11)
  // ============================================================
  insights: {
    title: string;
    subtitle: string;
    /** Privacy statement shown above insights */
    privacy: string;
    privacyDescription: string;
    /** Empty state when no insights have been computed yet */
    empty: string;
    emptyDescription: string;
    refresh: string;
    /** Tab labels */
    tabs: {
      focus: string;
      time: string;
      tasks: string;
      energy: string;
      weekly: string;
      experiments: string;
    };
    /** Categories — used for grouping and the empty-state badges */
    categories: {
      focus: string;
      time: string;
      task: string;
      energy: string;
      weekly: string;
      general: string;
    };
    /** Insight kind → label */
    kinds: {
      pattern: string;
      observation: string;
      suggestion: string;
      warning: string;
      celebration: string;
      correlation: string;
      experiment: string;
    };
    /** Dismiss action */
    dismiss: string;
    dismissed: string;
    /** Weekly review labels */
    weeklyReview: {
      title: string;
      period: string; // "{start} – {end}"
      whatWorked: string;
      whatWasDifficult: string;
      whatChanged: string;
      suggestedExperiment: string;
      startExperiment: string;
      metrics: {
        totalFocusMinutes: string;
        completedTasks: string;
        completedSessions: string;
        avgEnergy: string;
        interruptions: string;
      };
    };
    /** Chart aria-label templates */
    aria: {
      chart: string; // "Chart: {title}"
      bars: string; // "Bar chart with {count} bars"
      noData: string;
    };
    /** Loading state */
    loading: string;
    /** Error */
    error: string;
  };

  experiments: {
    title: string;
    subtitle: string;
    /** Empty state */
    empty: string;
    emptyDescription: string;
    /** Action: start a new experiment */
    start: string;
    startTitle: string;
    /** Field labels */
    fields: {
      type: string;
      title: string;
      hypothesis: string;
    };
    /** Submit / cancel */
    submit: string;
    cancel: string;
    /** Experiment types */
    types: {
      shorter_focus: string;
      longer_focus: string;
      morning_planning: string;
      evening_planning: string;
      smaller_steps: string;
      different_reminder_timing: string;
      earlier_breaks: string;
      later_breaks: string;
    };
    /** Type descriptions */
    descriptions: {
      shorter_focus: string;
      longer_focus: string;
      morning_planning: string;
      evening_planning: string;
      smaller_steps: string;
      different_reminder_timing: string;
      earlier_breaks: string;
      later_breaks: string;
    };
    /** Status labels */
    status: {
      active: string;
      completed: string;
      abandoned: string;
    };
    /** Result labels */
    result: {
      baseline: string;
      post: string;
      delta: string;
      description: string;
      noDescription: string;
    };
    /** Actions */
    complete: string;
    abandon: string;
    completeConfirm: string;
    abandonConfirm: string;
    /** Toasts */
    started: string;
    completed: string;
    abandoned: string;
    failed: string;
    /** Loading */
    loading: string;
    /** Aria */
    aria: {
      started: string;
      completed: string;
      abandoned: string;
    };
  };

  disclaimer: {
    notMedical: string;
  };

  // ============================================================
  // PI NETWORK (Prompt 12)
  // ============================================================
  pi: {
    /** Section title for the Pi account / premium page */
    title: string;
    subtitle: string;
    /** Status: signed-in or signed-out */
    signedInAs: string; // "Signed in as {username}"
    notSignedIn: string;
    /** Active network label */
    network: string;
    networkValue: string; // "Testnet (testing)" | "Mainnet (production)"
    /** Sign-in / sign-out buttons */
    signInWithPi: string;
    signOut: string;
    signingIn: string;
    signingOut: string;
    /** Premium entitlement display */
    premium: {
      title: string;
      active: string; // "Premium active"
      expired: string;
      free: string;
      expiresOn: string; // "Expires on {date}"
      lifetime: string;
      features: string;
      noEntitlement: string;
      noEntitlementDescription: string;
    };
    /** Products (centrally-configured) */
    products: {
      title: string;
      subtitle: string;
      monthly: string;
      yearly: string;
      lifetime: string;
      bestValue: string;
      perMonth: string;
      perYear: string;
      oneTime: string;
      buy: string; // "Buy with Pi"
      buyMonthly: string;
      buyYearly: string;
      buyLifetime: string;
      processing: string;
      success: string;
      cancelled: string;
      failed: string;
      piAmount: string; // "{amount} PI"
    };
    /** Payment history */
    history: {
      title: string;
      empty: string;
      emptyDescription: string;
      status: {
        pending: string;
        developer_approved: string;
        user_approved: string;
        transaction_verified: string;
        completed: string;
        cancelled: string;
        failed: string;
      };
      txid: string;
      amount: string;
      product: string;
      date: string;
      refresh: string;
    };
    /** Errors + compliance */
    errors: {
      notInPiBrowser: string;
      notInPiBrowserDescription: string;
      notConfigured: string;
      notConfiguredDescription: string;
      authFailed: string;
      authCancelled: string;
      paymentFailed: string;
      paymentCancelled: string;
      sessionExpired: string;
      retry: string;
    };
    /** Compliance banner — must always be visible on the Pi account page */
    compliance: {
      title: string;
      noPassphrases: string;
      noPassphrasesDescription: string;
      serverVerified: string;
      serverVerifiedDescription: string;
      testnetVsMainnet: string;
      testnetVsMainnetDescription: string;
    };
    /** Loading states */
    loading: string;
    loadingProducts: string;
    loadingHistory: string;
    loadingEntitlement: string;
    /** Aria */
    aria: {
      signedIn: string;
      signedOut: string;
      premiumActive: string;
      paymentComplete: string;
    };
  };

  footer: {
    tagline: string;
    rights: string;
  };
}

/** A function that asserts a value conforms to Dictionary at the type level. */
export function asDictionary<T extends Dictionary>(value: T): T {
  return value;
}

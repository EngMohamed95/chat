/**
 * Arabic language detection and localization utilities.
 */

// Arabic unicode range
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function isArabic(text?: string | null): boolean {
  if (!text) return false;
  return ARABIC_REGEX.test(text);
}

export function getTextDirection(text?: string | null): 'rtl' | 'ltr' {
  return isArabic(text) ? 'rtl' : 'ltr';
}

export const translations = {
  en: {
    // Dashboard Common
    conversations: 'Conversations',
    users: 'Team & Agents',
    settings: 'Settings',
    analytics: 'Analytics',
    install: 'Install Widget',
    online: 'Online',
    away: 'Away',
    all: 'All',
    open: 'Open',
    mine: 'Mine',
    closed: 'Closed',
    searchConversations: 'Search conversations...',
    typeReply: 'Write a reply... (Enter to send)',
    internalNote: 'Internal note (only visible to team)',
    cannedReplies: 'Canned Replies',
    assignTo: 'Assign to',
    unassigned: 'Unassigned',
    closeChat: 'Close Chat',
    reopenChat: 'Reopen Chat',
    visitorDetails: 'Visitor Details',
    device: 'Device',
    browser: 'Browser',
    location: 'Location',
    currentPage: 'Current Page',
    referrer: 'Referrer',
    firstSeen: 'First Seen',
    noConversations: 'No conversations found',
    selectConversation: 'Select a conversation from the left to start messaging',
    agentIsTyping: 'Agent is typing...',
    visitorIsTyping: 'Visitor is typing...',
    seen: 'Seen',
    justNow: 'Just now',
    save: 'Save Changes',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    roleAdmin: 'Administrator',
    roleAgent: 'Support Agent',
    name: 'Full Name',
    email: 'Email Address',
    password: 'Password',
    role: 'Role',
    status: 'Status',
    actions: 'Actions',
    active: 'Active',
    inactive: 'Inactive',
    addUser: 'Add New Agent',

    // Staff login
    staffPortal: 'Staff Portal',
    loginSubtitle: 'Sign in with your username and password.',
    username: 'Username',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    setupTitle: 'Create the administrator account',
    setupSubtitle: 'First run: create the admin account you will use to manage your team.',
    confirmPassword: 'Confirm Password',
    passwordsDontMatch: 'Passwords do not match',
    createAccount: 'Create Account',
    usernameHint: 'English letters, numbers, dot, dash or underscore (3-32 characters)',
    resetPassword: 'Reset password',
    newPasswordFor: 'New password for',
    passwordUpdated: 'Password updated',

    // Customer chat link
    
    // Widget
    weAreOnline: 'Online - We reply immediately',
    weAreAway: 'Away - Leave a message',
    startConversation: 'Start a conversation',
    yourName: 'Your Name',
    yourContact: 'Email or Phone Number',
    startChat: 'Start Chat',
    typeMessage: 'Type your message...',
    fileUpload: 'Upload image or document',
    poweredBy: 'Powered by LiveFlow',
    
    // Analytics
    totalConversations: 'Total Conversations',
    openTickets: 'Open Conversations',
    closedTickets: 'Resolved / Closed',
    messagesToday: 'Messages Sent Today',
    avgResponseTime: 'Avg Response Time',
    activityChart: 'Conversation Volume Over Time',
    
    // Settings
    companyName: 'Company Name',
    brandColor: 'Brand Primary Color',
    welcomeMsg: 'Welcome Greeting',
    offlineMsg: 'Away / Offline Greeting',
    widgetPosition: 'Widget Screen Position',
    prechatForm: 'Enable Pre-Chat Lead Capture Form',
    workingHours: 'Working Hours Schedule',
  },
  ar: {
    // Dashboard Common
    conversations: 'المحادثات',
    users: 'فريق العمل والوكلاء',
    settings: 'الإعدادات',
    analytics: 'التحليلات',
    install: 'تثبيت الودجت',
    online: 'متصل',
    away: 'غير متواجد',
    all: 'الكل',
    open: 'مفتوحة',
    mine: 'محادثاتي',
    closed: 'مغلقة',
    searchConversations: 'البحث في المحادثات...',
    typeReply: 'اكتب رداً... (Enter للإرسال)',
    internalNote: 'ملاحظة داخلية (مرئية للفريق فقط)',
    cannedReplies: 'ردود جاهزة وسريعة',
    assignTo: 'تعيين إلى',
    unassigned: 'غير مسند',
    closeChat: 'إغلاق المحادثة',
    reopenChat: 'إعادة فتح المحادثة',
    visitorDetails: 'بيانات الزائر',
    device: 'الجهاز',
    browser: 'المتصفح',
    location: 'الموقع الجغرافي',
    currentPage: 'الصفحة الحالية',
    referrer: 'المصدر / الإحالة',
    firstSeen: 'أول ظهور',
    noConversations: 'لا توجد محادثات',
    selectConversation: 'اختر محادثة من القائمة للبدء بالمراسلة',
    agentIsTyping: 'جاري كتابة الرد...',
    visitorIsTyping: 'العميل يكتب الآن...',
    seen: 'تمت القراءة',
    justNow: 'الآن',
    save: 'حفظ التغييرات',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    roleAdmin: 'مدير النظام',
    roleAgent: 'وكيل دعم',
    name: 'الاسم الكامل',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    role: 'الدور',
    status: 'الحالة',
    actions: 'الإجراءات',
    active: 'نشط',
    inactive: 'معطل',
    addUser: 'إضافة وكيل جديد',

    // Staff login
    staffPortal: 'بوابة الموظفين',
    loginSubtitle: 'سجّل الدخول باسم المستخدم وكلمة المرور.',
    username: 'اسم المستخدم',
    signIn: 'تسجيل الدخول',
    signingIn: 'جاري تسجيل الدخول...',
    setupTitle: 'إنشاء حساب المدير',
    setupSubtitle: 'هذا أول تشغيل: أنشئ حساب المدير الذي ستدير منه فريقك.',
    confirmPassword: 'تأكيد كلمة المرور',
    passwordsDontMatch: 'كلمتا المرور غير متطابقتين',
    createAccount: 'إنشاء الحساب',
    usernameHint: 'حروف إنجليزية وأرقام ونقطة أو شرطة (من 3 إلى 32 حرفاً)',
    resetPassword: 'تغيير كلمة المرور',
    newPasswordFor: 'كلمة المرور الجديدة لـ',
    passwordUpdated: 'تم تغيير كلمة المرور',

    // Customer chat link
    
    // Widget
    weAreOnline: 'متصل - نرد عادة في ثوانٍ',
    weAreAway: 'غير متواجدين حالياً - اترك رسالتك',
    startConversation: 'بدء محادثة جديدة',
    yourName: 'اسمك الكريم',
    yourContact: 'البريد أو رقم الهاتف',
    startChat: 'بدء الدردشة',
    typeMessage: 'اكتب رسالتك هنا...',
    fileUpload: 'رفع ملف أو صورة',
    poweredBy: 'مشغل بواسطة LiveFlow',
    
    // Analytics
    totalConversations: 'إجمالي المحادثات',
    openTickets: 'محادثات مفتوحة',
    closedTickets: 'محادثات مغلقة',
    messagesToday: 'رسائل اليوم',
    avgResponseTime: 'متوسط وقت الرد',
    activityChart: 'نشاط المحادثات عبر الأيام',
    
    // Settings
    companyName: 'اسم المنشأة أو الشركة',
    brandColor: 'لون الهوية الأساسي',
    welcomeMsg: 'رسالة الترحيب الأولى',
    offlineMsg: 'رسالة خارج أوقات العمل',
    widgetPosition: 'موقع زر الدردشة في الشاشة',
    prechatForm: 'تفعيل نموذج جمع بيانات الزائر قبل الدردشة',
    workingHours: 'جدول ساعات العمل',
  }
};

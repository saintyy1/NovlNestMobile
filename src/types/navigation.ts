export type RootStackParamList = {
  MainTabs: undefined;
  Notifications: undefined;
  Profile: undefined;
  Messages: undefined;
  Settings: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  Support: undefined;
  MyTickets: undefined;
  Browse: {
    browseType?: 'novels' | 'poems';
    selectedGenre?: string;
    resetBrowseType?: boolean;
  };
  NovelOverview: { id: string };
  ChaptersList: undefined;
  NovelReader: { novelId: string; chapterNumber?: number };
  PoemReader: { id: string };
  PoemOverview: { id: string};
  AddChapters: { novelId: string};
  EditChapter: { novelId: string; chapterId: string};
  PromoteScreen: { novelId?: string };
  PaymentCallback: { reference: string };
  EmailAction: { mode: string; oobCode: string; apiKey?: string };
  ChapterEditor: { 
    chapterNumber: number; 
    initialTitle?: string; 
    initialContent?: string; 
    onSave: (chapter: { title: string; content: string }) => void;
  };
}

import { NavigatorScreenParams } from '@react-navigation/native';
import { MainTabParamList } from '../components/navigation/MainTabNavigator';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Notifications: undefined;
  Profile: { userId?: string };
  Messages: undefined;
  Settings: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  Support: undefined;
  MyTickets: undefined;
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

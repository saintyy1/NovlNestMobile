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
  ReadingInsights: undefined;
  BookReadingInsights: { bookStats: any[] };
  Support: undefined;
  MyTickets: undefined;
  NovelOverview: { id: string };
  ChaptersList: undefined;
  NovelReader: { novelId: string; chapterNumber?: number };
  PoemReader: { id: string };
  PoemOverview: { id: string };
  AddChapters: { novelId: string };
  EditChapter: { novelId: string; chapterId: string };
  PromoteScreen: { novelId?: string };
  PaymentCallback: { reference: string };
  EmailAction: { mode: string; oobCode: string; apiKey?: string };
  CharacterManager: {
    novelId: string;
    initialCharacters?: any[];
    onSave?: (characters: any[]) => void;
  };
  ChapterEditor: {
    chapterNumber: number | string;
    initialTitle?: string;
    initialContent?: string;
    onSave: (chapter: { title: string; content: string }) => void;
  };
}

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './services/authContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Posts from './pages/Posts';
import PostEditor from './pages/PostEditor';
import PostImport from './pages/PostImport';
import WebsiteImport from './pages/WebsiteImport';
import GroupPosts from './pages/GroupPosts';
import GroupDrafts from './pages/GroupDrafts';
import GroupImport from './pages/GroupImport';
import Generate from './pages/Generate';
import BatchGenerate from './pages/BatchGenerate';
import Pages from './pages/Pages';
import BulkSchedule from './pages/BulkSchedule';
import PageForm from './pages/PageForm';
import PageTopics from './pages/PageTopics';
import PageToken from './pages/PageToken';
import Websites from './pages/Websites';
import WebsiteForm from './pages/WebsiteForm';
import WebsiteBlogPosts from './pages/WebsiteBlogPosts';
import WebsiteBlogPostEditor from './pages/WebsiteBlogPostEditor';
import Skills from './pages/Skills';
import Providers from './pages/Providers';
import UserManagement from './pages/UserManagement';
import ActivityLog from './pages/ActivityLog';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import ChangePassword from './pages/ChangePassword';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import UserRegister from './pages/UserRegister';
import UserLogin from './pages/UserLogin';
import UserDashboard from './pages/UserDashboard';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/user/register" element={<UserRegister />} />
          <Route path="/user/login" element={<UserLogin />} />
          <Route path="/user/dashboard" element={<UserDashboard />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="posts" element={<Posts />} />
            <Route path="posts/bulk-schedule" element={<BulkSchedule />} />
            <Route path="posts/new" element={<PostEditor />} />
            <Route path="posts/import" element={<PostImport />} />
            <Route path="posts/import-website-blog" element={<WebsiteImport />} />
            <Route path="posts/:id/edit" element={<PostEditor />} />
            <Route path="groups" element={<GroupPosts />} />
            <Route path="groups/import" element={<GroupImport />} />
            <Route path="groups/drafts" element={<GroupDrafts />} />
            <Route path="generate" element={<Generate />} />
            <Route path="batch-generate" element={<BatchGenerate />} />
            <Route path="pages" element={<Pages />} />
            <Route path="pages/new" element={<PageForm />} />
            <Route path="pages/:id/edit" element={<PageForm />} />
            <Route path="pages/:id/topics" element={<PageTopics />} />
            <Route path="pages/:id/token" element={<PageToken />} />
            <Route path="websites" element={<Websites />} />
            <Route path="websites/new" element={<WebsiteForm />} />
            <Route path="websites/:id/edit" element={<WebsiteForm />} />
            <Route path="website-posts" element={<WebsiteBlogPosts />} />
            <Route path="website-posts/:id/edit" element={<WebsiteBlogPostEditor />} />
            <Route path="skills" element={<Skills />} />
            <Route path="providers" element={<Providers />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="activity" element={<ActivityLog />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

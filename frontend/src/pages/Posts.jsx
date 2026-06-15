import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import PostCard from '../components/PostCard';
import Modal from '../components/ui/Modal';
import FacebookPreview from '../components/FacebookPreview';
import Skeleton from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid');
  const [editPost, setEditPost] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const filters = {
    page: searchParams.get('page') || '',
    status: searchParams.get('status') || '',
    media_type: searchParams.get('media_type') || '',
    date: searchParams.get('date') || '',
  };

  const loadPosts = async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const response = await api.get('/posts', { params });
      setPosts(response.data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load posts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/pages').then((r) => setPages(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    loadPosts();
  }, [searchParams]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const pageNameById = (id) => pages.find((p) => p.id === id)?.name || id;
  const pageById = (id) => pages.find((p) => p.id === id);

  const handlePublish = async (postId) => {
    try {
      await api.post(`/posts/${postId}/publish`);
      showToast('Post published', 'success');
      loadPosts();
    } catch (err) {
      showToast(err.response?.data?.error || 'Publish failed', 'error');
    }
  };

  const handleApprove = async (postId) => {
    try {
      await api.post(`/posts/${postId}/approve`);
      showToast('Post approved', 'success');
      loadPosts();
    } catch (err) {
      showToast(err.response?.data?.error || 'Approve failed', 'error');
    }
  };

  const handleDelete = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await api.delete(`/posts/${postId}`);
      showToast('Post deleted', 'success');
      loadPosts();
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/posts/${editPost.id}`, editPost);
      showToast('Post updated', 'success');
      setEditPost(null);
      loadPosts();
    } catch (err) {
      showToast(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Posts</h1>
          <p>Manage generated content for Facebook pages.</p>
        </div>
        <div className="header-actions">
          <button type="button" className={`btn btn-secondary ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')}>Grid</button>
          <button type="button" className={`btn btn-secondary ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>Table</button>
        </div>
      </div>

      <div className="card filters-bar">
        <select value={filters.page} onChange={(e) => setFilter('page', e.target.value)}>
          <option value="">All pages</option>
          {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {['draft', 'pending_approval', 'scheduled', 'published', 'failed'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={filters.media_type} onChange={(e) => setFilter('media_type', e.target.value)}>
          <option value="">All media</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="none">None</option>
        </select>
        <input type="date" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />
      </div>

      {loading ? (
        <Skeleton lines={5} />
      ) : view === 'grid' ? (
        <div className="post-grid">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              pageName={pageNameById(post.page_id)}
              onEdit={setEditPost}
              onPublish={handlePublish}
              onApprove={handleApprove}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="card table-wrapper">
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Page</th><th>Status</th><th>Media</th><th>Scheduled</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>{post.id}</td>
                  <td>{pageNameById(post.page_id)}</td>
                  <td>{post.status}</td>
                  <td>{post.media_type}</td>
                  <td>{post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : '-'}</td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => setEditPost(post)}>Edit</button>
                    {post.status === 'draft' && <button type="button" className="btn-link" onClick={() => handlePublish(post.id)}>Publish</button>}
                    {post.status === 'pending_approval' && <button type="button" className="btn-link" onClick={() => handleApprove(post.id)}>Approve</button>}
                    <button type="button" className="btn-link" onClick={() => handleDelete(post.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editPost} title="Edit post" onClose={() => setEditPost(null)} wide>
        {editPost && (
          <div className="edit-post-layout">
            <div>
              <label>Topic<input value={editPost.topic || ''} onChange={(e) => setEditPost({ ...editPost, topic: e.target.value })} /></label>
              <label>Content<textarea rows={6} value={editPost.content || ''} onChange={(e) => setEditPost({ ...editPost, content: e.target.value })} /></label>
              <label>Scheduled<input type="datetime-local" value={editPost.scheduled_at?.slice(0, 16) || ''} onChange={(e) => setEditPost({ ...editPost, scheduled_at: e.target.value })} /></label>
              <button type="button" className="btn btn-primary" onClick={saveEdit}>Save</button>
            </div>
            <FacebookPreview post={editPost} pageName={pageNameById(editPost.page_id)} avatarUrl={pageById(editPost.page_id)?.avatar_url} />
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useEffect, useState, useMemo } from 'react';

import { useSearchParams } from 'react-router-dom';

import { CalendarClock, PenLine, Upload, Download } from 'lucide-react';

import api from '../services/api';

import { formatDateTime } from '../utils/date';

import PostCard from '../components/PostCard';

import PostEditorModal from '../components/PostEditorModal';

import BulkScheduleModal from '../components/BulkScheduleModal';
import PostImportModal from '../components/PostImportModal';
import { downloadImportTemplate } from '../utils/postImportExport';

import Skeleton from '../components/ui/Skeleton';

import Badge from '../components/ui/Badge';

import { useToast } from '../context/ToastContext';

import { mediaTypeLabel, postStatusLabel } from '../config/vi';



const SCHEDULABLE = new Set(['draft', 'pending_approval']);



export default function Posts() {

  const [posts, setPosts] = useState([]);

  const [pages, setPages] = useState([]);

  const [loading, setLoading] = useState(true);

  const [view, setView] = useState('table');

  const [editorPost, setEditorPost] = useState(null);

  const [editorOpen, setEditorOpen] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);

  const [importOpen, setImportOpen] = useState(false);

  const [bulkSaving, setBulkSaving] = useState(false);

  const [selectedIds, setSelectedIds] = useState(new Set());

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

      params.limit = 500;

      const response = await api.get('/posts', { params });

      setPosts(response.data);

      setSelectedIds(new Set());

    } catch (err) {

      showToast(err.response?.data?.error || 'Không tải được bài viết', 'error');

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



  useEffect(() => {

    if (searchParams.get('action') === 'create') {

      openCreate();

      const next = new URLSearchParams(searchParams);

      next.delete('action');

      setSearchParams(next, { replace: true });

    }

  }, [searchParams]);



  const schedulablePosts = useMemo(

    () => posts.filter((p) => SCHEDULABLE.has(p.status)),

    [posts]

  );



  const selectedSchedulableIds = useMemo(() => {

    const ids = [...selectedIds].filter((id) => {

      const post = posts.find((p) => p.id === id);

      return post && SCHEDULABLE.has(post.status);

    });

    return ids;

  }, [selectedIds, posts]);



  const bulkTargetIds = selectedSchedulableIds.length

    ? selectedSchedulableIds

    : schedulablePosts.map((p) => p.id);



  const setFilter = (key, value) => {

    const next = new URLSearchParams(searchParams);

    if (value) next.set(key, value);

    else next.delete(key);

    setSearchParams(next);

  };



  const pageNameById = (id) => pages.find((p) => String(p.id) === String(id))?.name || id;



  const openCreate = () => {

    setEditorPost(null);

    setEditorOpen(true);

  };



  const openEdit = (post) => {

    setEditorPost(post);

    setEditorOpen(true);

  };



  const closeEditor = () => {

    setEditorOpen(false);

    setEditorPost(null);

  };



  const toggleSelect = (id) => {

    setSelectedIds((prev) => {

      const next = new Set(prev);

      if (next.has(id)) next.delete(id);

      else next.add(id);

      return next;

    });

  };



  const toggleSelectAllSchedulable = () => {

    if (selectedSchedulableIds.length === schedulablePosts.length && schedulablePosts.length) {

      setSelectedIds(new Set());

      return;

    }

    setSelectedIds(new Set(schedulablePosts.map((p) => p.id)));

  };



  const handleSaved = () => {

    showToast(editorPost?.id ? 'Đã cập nhật bài viết' : 'Đã tạo bài viết', 'success');

    loadPosts();

  };



  const handleEditorError = (message) => {

    showToast(message, 'error');

  };



  const handlePublish = async (postId) => {

    try {

      await api.post(`/posts/${postId}/publish`);

      showToast('Đã đăng bài', 'success');

      loadPosts();

    } catch (err) {

      showToast(err.response?.data?.error || 'Đăng bài thất bại', 'error');

    }

  };



  const handleApprove = async (postId) => {

    try {

      await api.post(`/posts/${postId}/approve`);

      showToast('Đã duyệt bài', 'success');

      loadPosts();

    } catch (err) {

      showToast(err.response?.data?.error || 'Duyệt bài thất bại', 'error');

    }

  };



  const handleDelete = async (postId) => {

    if (!window.confirm('Xóa bài viết này?')) return;

    try {

      await api.delete(`/posts/${postId}`);

      showToast('Đã xóa bài viết', 'success');

      loadPosts();

    } catch (err) {

      showToast(err.response?.data?.error || 'Xóa bài thất bại', 'error');

    }

  };



  const handleBulkSchedule = async ({ start_date, times, post_ids }) => {
    setBulkSaving(true);

    try {

      const payload = {

        start_date,

        times,

        page_id: filters.page ? Number(filters.page) : undefined,

      };

      if (post_ids?.length) payload.post_ids = post_ids;



      const response = await api.post('/posts/bulk-schedule', payload);

      showToast(

        `Đã lên lịch ${response.data.scheduled_count} bài — ${response.data.days} ngày × ${response.data.slots_per_day} bài/ngày`,

        'success'

      );

      setBulkOpen(false);

      loadPosts();

    } catch (err) {

      showToast(err.response?.data?.error || 'Lên lịch hàng loạt thất bại', 'error');

    } finally {

      setBulkSaving(false);

    }

  };



  const handleDownloadTemplate = async () => {

    try {

      await downloadImportTemplate(api);

      showToast('Đã tải file mẫu Excel', 'success');

    } catch (err) {

      showToast(err.response?.data?.error || 'Tải file mẫu thất bại', 'error');

    }

  };



  const handleImported = (result) => {

    const skipped = result.errors?.length ? ` — ${result.errors.length} dòng lỗi` : '';

    showToast(

      `Đã import ${result.created_count} bài (${result.scheduled_count} đã lên lịch)${skipped}`,

      'success'

    );

    loadPosts();

  };



  return (

    <div className="page-shell">

      <div className="page-header">

        <div>

          <h1>Bài viết</h1>

          <p>Quản lý bài đăng — import Excel hoặc lên lịch hàng loạt theo giờ mỗi ngày.</p>

        </div>

        <div className="header-actions">

          <button type="button" className="btn btn-secondary" onClick={handleDownloadTemplate}>

            <Download size={16} />

            File mẫu Excel

          </button>

          <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}>

            <Upload size={16} />

            Import Excel

          </button>

          {schedulablePosts.length > 0 && (

            <button

              type="button"

              className="btn btn-secondary"

              onClick={() => setBulkOpen(true)}

            >

              <CalendarClock size={16} />

              Lên lịch hàng loạt ({bulkTargetIds.length})

            </button>

          )}

          <button type="button" className="btn btn-primary post-create-btn" onClick={openCreate}>

            <PenLine size={16} />

            Viết bài tay

          </button>

          <button type="button" className={`btn btn-secondary ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')}>Lưới</button>

          <button type="button" className={`btn btn-secondary ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>Bảng</button>

        </div>

      </div>



      <div className="card filters-bar">

        <select value={filters.page} onChange={(e) => setFilter('page', e.target.value)}>

          <option value="">Tất cả fanpage</option>

          {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}

        </select>

        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>

          <option value="">Tất cả trạng thái</option>

          {['draft', 'pending_approval', 'scheduled', 'published', 'failed'].map((s) => (

            <option key={s} value={s}>{postStatusLabel(s)}</option>

          ))}

        </select>

        <select value={filters.media_type} onChange={(e) => setFilter('media_type', e.target.value)}>

          <option value="">Tất cả media</option>

          <option value="image">Ảnh</option>

          <option value="video">Video</option>

          <option value="none">Không media</option>

        </select>

        <input type="date" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />

      </div>



      {schedulablePosts.length > 0 && (

        <p className="field-hint" style={{ margin: '0 0 12px' }}>

          {selectedSchedulableIds.length > 0

            ? `Đã chọn ${selectedSchedulableIds.length} bài — bấm Lên lịch hàng loạt, chỉ cần nhập giờ (VD: 4 lần/ngày).`

            : `Có ${schedulablePosts.length} bài có thể lên lịch — tick chọn hoặc lên lịch tất cả.`}

        </p>

      )}



      {loading ? (

        <Skeleton lines={5} />

      ) : view === 'grid' ? (

        <div className="post-grid">

          {posts.map((post) => (

            <PostCard

              key={post.id}

              post={post}

              pageName={pageNameById(post.page_id)}

              onEdit={openEdit}

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

              <tr>

                <th>

                  <input

                    type="checkbox"

                    checked={schedulablePosts.length > 0 && selectedSchedulableIds.length === schedulablePosts.length}

                    onChange={toggleSelectAllSchedulable}

                    disabled={!schedulablePosts.length}

                    title="Chọn tất cả bài có thể lên lịch"

                  />

                </th>

                <th>ID</th><th>Fanpage</th><th>Chủ đề</th><th>Trạng thái</th><th>Lên lịch</th><th>Thao tác</th>

              </tr>

            </thead>

            <tbody>

              {posts.map((post) => (

                <tr key={post.id}>

                  <td>

                    {SCHEDULABLE.has(post.status) ? (

                      <input

                        type="checkbox"

                        checked={selectedIds.has(post.id)}

                        onChange={() => toggleSelect(post.id)}

                      />

                    ) : null}

                  </td>

                  <td>{post.id}</td>

                  <td>{pageNameById(post.page_id)}</td>

                  <td>{post.topic || '—'}</td>

                  <td><Badge status={post.status} /></td>

                  <td>{post.scheduled_at ? formatDateTime(post.scheduled_at) : '—'}</td>

                  <td>

                    <button type="button" className="btn-link" onClick={() => openEdit(post)}>Sửa</button>

                    {post.status === 'draft' && <button type="button" className="btn-link" onClick={() => handlePublish(post.id)}>Đăng</button>}

                    {post.status === 'pending_approval' && <button type="button" className="btn-link" onClick={() => handleApprove(post.id)}>Duyệt</button>}

                    <button type="button" className="btn-link" onClick={() => handleDelete(post.id)}>Xóa</button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      )}



      <PostEditorModal

        open={editorOpen}

        post={editorPost}

        pages={pages}

        initialPageId={filters.page || ''}

        onClose={closeEditor}

        onSaved={handleSaved}

        onError={handleEditorError}

      />



      <BulkScheduleModal

        open={bulkOpen}

        onClose={() => setBulkOpen(false)}

        postIds={selectedSchedulableIds.length ? selectedSchedulableIds : undefined}

        postCount={bulkTargetIds.length}

        onSubmit={handleBulkSchedule}

        saving={bulkSaving}

      />



      <PostImportModal

        open={importOpen}

        onClose={() => setImportOpen(false)}

        pages={pages}

        onImported={handleImported}

      />

    </div>

  );

}



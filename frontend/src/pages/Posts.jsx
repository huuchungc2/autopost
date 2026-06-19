import { useEffect, useState, useMemo } from 'react';

import { useNavigate, useSearchParams } from 'react-router-dom';

import { CalendarClock, PenLine, Upload, Download, Trash2, Send } from 'lucide-react';

import api from '../services/api';

import { formatDateTime } from '../utils/date';

import PostCard from '../components/PostCard';
import PostErrorDetail from '../components/PostErrorDetail';
import PostImagePromptActions from '../components/PostImagePromptActions';

import { downloadImportTemplate } from '../utils/postImportExport';

import Skeleton from '../components/ui/Skeleton';

import Badge from '../components/ui/Badge';

import { useToast } from '../context/ToastContext';

import { mediaTypeLabel, postStatusLabel } from '../config/vi';
import { canManualPublish, manualPublishLabel } from '../utils/postActions';



const SCHEDULABLE = new Set(['draft', 'pending_approval']);

const BULK_STATUS_OPTIONS = ['draft', 'pending_approval', 'scheduled', 'published', 'failed'];



const PAGE_SIZE = 30;

export default function Posts() {

  const [posts, setPosts] = useState([]);

  const [totalPosts, setTotalPosts] = useState(0);

  const [pages, setPages] = useState([]);

  const [loading, setLoading] = useState(true);

  const [view, setView] = useState('table');

  const [bulkActionSaving, setBulkActionSaving] = useState(false);

  const [bulkStatus, setBulkStatus] = useState('');

  const [publishingIds, setPublishingIds] = useState(new Set());

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { showToast } = useToast();



  const filters = {

    page: searchParams.get('page') || '',

    status: searchParams.get('status') || '',

    media_type: searchParams.get('media_type') || '',

    date: searchParams.get('date') || '',

    sort: searchParams.get('sort') || 'scheduled_at',

    order: searchParams.get('order') || 'asc',

    page_num: searchParams.get('page_num') || '1',

  };



  const loadPosts = async () => {

    setLoading(true);

    try {

      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));

      params.limit = PAGE_SIZE;

      const response = await api.get('/posts', { params });

      const data = response.data;

      setPosts(data.items || []);

      setTotalPosts(data.total ?? (data.items || []).length);

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



  const pageNameById = (id) => pages.find((p) => String(p.id) === String(id))?.name || id;

  const buildImportPath = () => {
    const params = new URLSearchParams();
    if (filters.page) params.set('page', filters.page);
    const query = params.toString();
    return query ? `/posts/import?${query}` : '/posts/import';
  };

  const openImport = () => {
    navigate(buildImportPath());
  };

  const buildEditorPath = (postId = null) => {
    const params = new URLSearchParams();
    if (filters.page) params.set('page', filters.page);
    const query = params.toString();
    if (postId) {
      return query ? `/posts/${postId}/edit?${query}` : `/posts/${postId}/edit`;
    }
    return query ? `/posts/new?${query}` : '/posts/new';
  };

  const openCreate = () => {
    navigate(buildEditorPath());
  };

  const openEdit = (post) => {
    navigate(buildEditorPath(post.id));
  };

  useEffect(() => {

    loadPosts();

  }, [searchParams]);



  useEffect(() => {

    if (searchParams.get('action') === 'create') {
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      const query = next.toString();
      navigate(query ? `/posts/new?${query}` : '/posts/new', { replace: true });
    }

  }, [searchParams, navigate]);

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

    if (key !== 'page_num') next.set('page_num', '1');

    setSearchParams(next);

  };



  const currentPage = Math.max(parseInt(filters.page_num, 10) || 1, 1);

  const totalPages = Math.max(1, Math.ceil(totalPosts / PAGE_SIZE));

  const goToPage = (pageNum) => {

    const next = new URLSearchParams(searchParams);

    next.set('page_num', String(pageNum));

    setSearchParams(next);

  };



  const toggleSelect = (id) => {

    setSelectedIds((prev) => {

      const next = new Set(prev);

      if (next.has(id)) next.delete(id);

      else next.add(id);

      return next;

    });

  };



  const selectedCount = selectedIds.size;

  const allOnPageSelected = posts.length > 0 && posts.every((p) => selectedIds.has(p.id));



  const toggleSelectAllOnPage = () => {

    if (allOnPageSelected) {

      setSelectedIds(new Set());

      return;

    }

    setSelectedIds(new Set(posts.map((p) => p.id)));

  };



  const handleBulkDelete = async () => {

    const ids = [...selectedIds];

    if (!ids.length) return;

    if (!window.confirm(`Xóa ${ids.length} bài đã chọn?`)) return;

    setBulkActionSaving(true);

    try {

      const response = await api.post('/posts/bulk-delete', { post_ids: ids });

      const skipped = response.data.errors?.length ? ` — ${response.data.errors.length} lỗi` : '';

      showToast(`Đã xóa ${response.data.deleted_count} bài${skipped}`, 'success');

      loadPosts();

    } catch (err) {

      showToast(err.response?.data?.error || 'Xóa hàng loạt thất bại', 'error');

    } finally {

      setBulkActionSaving(false);

    }

  };



  const handleBulkStatus = async () => {

    const ids = [...selectedIds];

    if (!ids.length || !bulkStatus) return;

    setBulkActionSaving(true);

    try {

      const response = await api.post('/posts/bulk-status', { post_ids: ids, status: bulkStatus });

      const skipped = response.data.errors?.length ? ` — ${response.data.errors.length} lỗi` : '';

      showToast(

        `Đã đổi trạng thái ${response.data.updated_count} bài → ${postStatusLabel(bulkStatus)}${skipped}`,

        'success'

      );

      setBulkStatus('');

      loadPosts();

    } catch (err) {

      showToast(err.response?.data?.error || 'Đổi trạng thái hàng loạt thất bại', 'error');

    } finally {

      setBulkActionSaving(false);

    }

  };



  const toggleSelectAllSchedulable = () => {

    const schedulableIds = schedulablePosts.map((p) => p.id);

    const allSchedulableSelected = schedulableIds.length > 0

      && schedulableIds.every((id) => selectedIds.has(id));

    if (allSchedulableSelected) {

      setSelectedIds((prev) => {

        const next = new Set(prev);

        schedulableIds.forEach((id) => next.delete(id));

        return next;

      });

      return;

    }

    setSelectedIds((prev) => new Set([...prev, ...schedulableIds]));

  };



  const handlePublish = async (postId) => {

    if (publishingIds.has(postId)) return;

    const post = posts.find((p) => p.id === postId);

    const label = post ? manualPublishLabel(post) : 'Đăng';

    if (!window.confirm(`${label} bài #${postId} lên Facebook ngay?`)) return;

    setPublishingIds((prev) => new Set(prev).add(postId));

    try {

      await api.post(`/posts/${postId}/publish`);

      showToast('Đã đăng bài', 'success');

      loadPosts();

    } catch (err) {

      const msg = err.response?.data?.error || 'Đăng bài thất bại';
      showToast(`${msg} — bấm dòng lỗi đỏ để xem chi tiết`, 'error');
      loadPosts();

    } finally {

      setPublishingIds((prev) => {

        const next = new Set(prev);

        next.delete(postId);

        return next;

      });

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



  const openBulkSchedule = () => {
    const params = new URLSearchParams();
    if (selectedSchedulableIds.length) params.set('ids', selectedSchedulableIds.join(','));
    if (filters.page) params.set('page', filters.page);
    const query = params.toString();
    navigate(query ? `/posts/bulk-schedule?${query}` : '/posts/bulk-schedule');
  };

  const handleDownloadTemplate = async () => {

    try {

      await downloadImportTemplate(api);

      showToast('Đã tải file mẫu Excel', 'success');

    } catch (err) {

      showToast(err.response?.data?.error || 'Tải file mẫu thất bại', 'error');

    }

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

          <button type="button" className="btn btn-secondary" onClick={openImport}>

            <Upload size={16} />

            Import Excel

          </button>

          {schedulablePosts.length > 0 && (

            <button

              type="button"

              className="btn btn-secondary"

              onClick={openBulkSchedule}

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

          {['draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'failed'].map((s) => (

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

        <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>

          <option value="scheduled_at">Sắp xếp: Lên lịch</option>

          <option value="created_at">Sắp xếp: Ngày tạo</option>

          <option value="published_at">Sắp xếp: Ngày đăng</option>

          <option value="id">Sắp xếp: ID</option>

        </select>

        <select value={filters.order} onChange={(e) => setFilter('order', e.target.value)}>

          <option value="asc">Tăng dần</option>

          <option value="desc">Giảm dần</option>

        </select>

      </div>



      {selectedCount > 0 && (

        <div className="card posts-bulk-bar">

          <span className="posts-bulk-bar-label">Đã chọn <strong>{selectedCount}</strong> bài</span>

          <div className="posts-bulk-bar-actions">

            <select

              value={bulkStatus}

              onChange={(e) => setBulkStatus(e.target.value)}

              disabled={bulkActionSaving}

            >

              <option value="">Đổi trạng thái...</option>

              {BULK_STATUS_OPTIONS.map((s) => (

                <option key={s} value={s}>{postStatusLabel(s)}</option>

              ))}

            </select>

            <button

              type="button"

              className="btn btn-secondary btn-sm"

              onClick={handleBulkStatus}

              disabled={!bulkStatus || bulkActionSaving}

            >

              Áp dụng

            </button>

            <button

              type="button"

              className="btn btn-secondary btn-sm posts-bulk-delete-btn"

              onClick={handleBulkDelete}

              disabled={bulkActionSaving}

            >

              <Trash2 size={14} />

              Xóa đã chọn

            </button>

            <button

              type="button"

              className="btn-link"

              onClick={() => { setSelectedIds(new Set()); setBulkStatus(''); }}

            >

              Bỏ chọn

            </button>

          </div>

        </div>

      )}



      {schedulablePosts.length > 0 && (

        <p className="field-hint" style={{ margin: '0 0 12px' }}>

          {selectedSchedulableIds.length > 0

            ? `Đã chọn ${selectedSchedulableIds.length} bài có thể lên lịch — bấm Lên lịch hàng loạt.`

            : `Có ${schedulablePosts.length} bài có thể lên lịch — tick chọn hoặc dùng "Chọn bài lên lịch".`}

          {' '}

          <button type="button" className="btn-link" onClick={toggleSelectAllSchedulable}>Chọn bài lên lịch</button>

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

              selected={selectedIds.has(post.id)}

              onToggleSelect={() => toggleSelect(post.id)}

              onEdit={openEdit}

              onPublish={handlePublish}

              onApprove={handleApprove}

              onDelete={handleDelete}

              onRefresh={loadPosts}

              publishing={publishingIds.has(post.id)}

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

                    checked={posts.length > 0 && allOnPageSelected}

                    onChange={toggleSelectAllOnPage}

                    disabled={!posts.length}

                    title="Chọn tất cả bài trên trang này"

                  />

                </th>

                <th>ID</th><th>Fanpage</th><th>Chủ đề</th><th>Trạng thái</th><th>Lỗi</th><th>Lên lịch</th><th>Facebook</th><th>Prompt ảnh</th><th>Thao tác</th>

              </tr>

            </thead>

            <tbody>

              {posts.map((post) => (

                <tr key={post.id}>

                  <td>

                    <input

                      type="checkbox"

                      checked={selectedIds.has(post.id)}

                      onChange={() => toggleSelect(post.id)}

                    />

                  </td>

                  <td>{post.id}</td>

                  <td>{pageNameById(post.page_id)}</td>

                  <td>{post.topic || '—'}</td>

                  <td><Badge status={post.status} /></td>

                  <td className="post-error-cell">
                    <PostErrorDetail post={post} compact />
                    {!post.error_message && post.status !== 'failed' && post.image_job_status !== 'failed' ? '—' : null}
                  </td>

                  <td>{post.scheduled_at ? formatDateTime(post.scheduled_at) : '—'}</td>

                  <td className="post-fb-ids">
                    {post.fb_post_id ? (
                      <small>
                        Post: {post.fb_post_id}
                        {post.fb_photo_id ? <><br />Ảnh: {post.fb_photo_id}</> : null}
                      </small>
                    ) : '—'}
                  </td>

                  <td>
                    <PostImagePromptActions post={post} onGenerated={loadPosts} compact />
                  </td>

                  <td>

                    <button type="button" className="btn-link" onClick={() => openEdit(post)}>Sửa</button>

                    {canManualPublish(post) && (
                      <button
                        type="button"
                        className="btn-link posts-publish-btn"
                        onClick={() => handlePublish(post.id)}
                        disabled={publishingIds.has(post.id)}
                        title="Đăng thủ công lên Facebook"
                      >
                        <Send size={14} />
                        {publishingIds.has(post.id) ? 'Đang đăng...' : manualPublishLabel(post)}
                      </button>
                    )}

                    {post.status === 'pending_approval' && (
                      <button type="button" className="btn-link" onClick={() => handleApprove(post.id)}>Duyệt</button>
                    )}

                    <button type="button" className="btn-link" onClick={() => handleDelete(post.id)}>Xóa</button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      )}



      {!loading && totalPosts > PAGE_SIZE && (

        <div className="posts-pagination">

          <button type="button" className="btn btn-secondary btn-sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>

            Trước

          </button>

          <span>Trang {currentPage} / {totalPages} — {totalPosts} bài</span>

          <button type="button" className="btn btn-secondary btn-sm" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>

            Sau

          </button>

        </div>

      )}


    </div>

  );

}



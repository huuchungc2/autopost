import { useEffect, useState } from 'react';
import api from '../services/api';
import useJobPolling from '../hooks/useJobPolling';
import { useToast } from '../context/ToastContext';

export default function BatchGenerate() {
  const [pages, setPages] = useState([]);
  const [pageId, setPageId] = useState('');
  const [jobs, setJobs] = useState([{ topic: '', scheduled_date: '', scheduled_time: '08:00:00' }]);
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    api.get('/pages').then((response) => {
      setPages(response.data);
      if (response.data.length) setPageId(String(response.data[0].id));
    }).catch(console.error);
  }, []);

  useJobPolling(batchId, (data) => setStatus(data), polling && !!batchId);

  const handleJobChange = (index, field, value) => {
    setJobs((current) => current.map((job, idx) => (idx === index ? { ...job, [field]: value } : job)));
  };

  const addJob = () => setJobs((c) => [...c, { topic: '', scheduled_date: '', scheduled_time: '08:00:00' }]);
  const removeJob = (index) => setJobs((c) => c.filter((_, idx) => idx !== index));

  const handleCreateBatch = async () => {
    setIsLoading(true);
    try {
      const validJobs = jobs.filter((job) => job.topic && job.scheduled_date);
      if (!validJobs.length) {
        showToast('Provide at least one valid job', 'error');
        return;
      }
      const response = await api.post('/posts/generate-batch', { page_id: Number(pageId), jobs: validJobs });
      setBatchId(response.data.batch_id);
      setPolling(true);
      showToast(`Batch created (${response.data.count} jobs)`, 'success');
    } catch (error) {
      showToast(error.response?.data?.error || 'Batch create failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const processBatch = async () => {
    if (!batchId) return;
    setIsLoading(true);
    try {
      await api.post(`/jobs/${batchId}/process`);
      showToast('Batch processing started', 'success');
      setPolling(true);
    } catch (error) {
      showToast(error.response?.data?.error || 'Batch processing failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const progress = status?.summary
    ? Math.round(((status.summary.done + status.summary.failed) / status.summary.total) * 100)
    : 0;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Batch Generate</h1>
          <p>Create and auto-process batches of scheduled posts.</p>
        </div>
      </div>

      <div className="card form-card">
        <label>
          Facebook page
          <select value={pageId} onChange={(e) => setPageId(e.target.value)}>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>{page.name}</option>
            ))}
          </select>
        </label>
        {jobs.map((job, index) => (
          <div key={index} className="batch-job-row">
            <input value={job.topic} onChange={(e) => handleJobChange(index, 'topic', e.target.value)} placeholder="Topic" />
            <input type="date" value={job.scheduled_date} onChange={(e) => handleJobChange(index, 'scheduled_date', e.target.value)} />
            <input type="time" value={job.scheduled_time} onChange={(e) => handleJobChange(index, 'scheduled_time', e.target.value)} />
            <button type="button" className="btn-link" onClick={() => removeJob(index)}>Remove</button>
          </div>
        ))}
        <div className="header-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={addJob}>Add job</button>
          <button type="button" className="btn btn-primary" onClick={handleCreateBatch} disabled={isLoading || !pageId}>Create batch</button>
          <button type="button" className="btn btn-secondary" onClick={processBatch} disabled={!batchId || isLoading}>Process batch</button>
        </div>
        {batchId && (
          <div style={{ marginTop: 16 }}>
            <div className="form-success">Batch ID: {batchId}</div>
            {status && (
              <div className="progress-bar-wrap">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
                <span>{progress}% — {status.summary.done} done, {status.summary.failed} failed, {status.summary.pending} pending</span>
              </div>
            )}
          </div>
        )}
      </div>

      {status && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Batch Status</h2>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Job</th><th>Topic</th><th>Status</th><th>Post</th><th>Error</th></tr>
              </thead>
              <tbody>
                {status.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.id}</td>
                    <td>{job.topic}</td>
                    <td>{job.status}</td>
                    <td>{job.post_id || '-'}</td>
                    <td>{job.error_message || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

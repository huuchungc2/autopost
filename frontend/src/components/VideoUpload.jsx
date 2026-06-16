import { useState } from 'react';
import api from '../services/api';

export default function VideoUpload({ onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('video', file);
      const response = await api.post('/upload/video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploaded?.({ video_url: response.data.url, filename: file.name });
    } catch (err) {
      setError(err.response?.data?.error || 'Upload thất bại');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="video-upload">
      <label className="video-upload-label">
        <input type="file" accept="video/mp4,video/quicktime,video/*" onChange={handleFile} disabled={uploading} />
        {uploading ? 'Đang upload...' : 'Chọn file video (tối đa 500MB)'}
      </label>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

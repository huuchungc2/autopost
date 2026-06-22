import { Component } from 'react';
import Button from './ui/Button';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-shell">
          <div className="card">
            <h2>Đã xảy ra lỗi</h2>
            <p>Vui lòng tải lại trang hoặc liên hệ quản trị viên.</p>
            <Button type="button" onClick={() => window.location.reload()}>
              Tải lại
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Button({ children, variant = 'primary', className = '', ...props }) {
  return (
    <button type="button" className={`btn btn-${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

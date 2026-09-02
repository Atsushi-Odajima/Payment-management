/** Label + control + help / inline error, shared by the entity forms. */
export function FormField({
  id,
  label,
  required,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | null;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </label>
      {children}
      {help && !error && <p className="help">{help}</p>}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

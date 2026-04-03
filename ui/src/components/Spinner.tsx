interface SpinnerProps {
  /** Optional message shown below the spinner (e.g. a timeout warning). */
  message?: string
}

/**
 * Full-page spinner shown while the auth context is initialising.
 * If an optional `message` is provided it is shown below the spinner.
 */
export default function Spinner({ message }: SpinnerProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4
                     border-gray-300 border-t-brand-600 dark:border-gray-600 dark:border-t-brand-500"
        />
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {message ?? 'Loading…'}
        </p>
      </div>
    </div>
  )
}
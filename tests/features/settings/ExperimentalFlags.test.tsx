import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExperimentalFlags } from '@/features/settings/components/ExperimentalFlags'
import { FLAGS } from '@/lib/flags'

describe('ExperimentalFlags', () => {
  it('says there are none while there are no flags, or lists them', () => {
    const { container } = render(<ExperimentalFlags />)
    const descriptions = (Object.values(FLAGS) as { description: string }[]).map(
      (f) => f.description,
    )
    if (descriptions.length === 0) expect(container).toHaveTextContent('None right now')
    else for (const d of descriptions) expect(container).toHaveTextContent(d)
  })
})

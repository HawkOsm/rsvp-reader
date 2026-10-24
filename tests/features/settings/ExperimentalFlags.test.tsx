import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExperimentalFlags } from '@/features/settings/components/ExperimentalFlags'
import { FLAGS } from '@/lib/flags'

describe('ExperimentalFlags', () => {
  it('shows nothing while there are no flags', () => {
    const { container } = render(<ExperimentalFlags />)
    if (Object.keys(FLAGS).length === 0) expect(container).toBeEmptyDOMElement()
    else expect(container).toHaveTextContent('Experimental')
  })
})

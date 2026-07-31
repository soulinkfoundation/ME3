import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TiptapImageNode from './TiptapImageNode.vue'

function mountNode(overrides: Record<string, any> = {}) {
  const updateAttributes = vi.fn()
  const deleteNode = vi.fn()

  const wrapper = mount(TiptapImageNode, {
    props: {
      node: { attrs: { src: 'test.jpg', alt: 'Test', ...overrides } },
      updateAttributes,
      deleteNode,
      selected: false,
    },
  })

  return { wrapper, updateAttributes, deleteNode }
}

describe('TiptapImageNode', () => {
  it('opens menu and deletes image', async () => {
    const { wrapper, deleteNode } = mountNode()

    await wrapper.find('.image-menu-btn').trigger('click')
    expect(wrapper.find('.image-menu').exists()).toBe(true)

    const deleteButton = wrapper.find('.image-menu-item.danger')
    await deleteButton.trigger('click')

    expect(deleteNode).toHaveBeenCalledTimes(1)
  })

  it('edits caption and updates attributes', async () => {
    const { wrapper, updateAttributes } = mountNode()

    const input = wrapper.find('.image-caption-input')
    expect(input.exists()).toBe(true)

    await input.setValue('New caption')
    expect((input.element as HTMLInputElement).value).toBe('New caption')
    expect(updateAttributes).not.toHaveBeenCalled()

    await input.trigger('blur')

    expect(updateAttributes).toHaveBeenCalledWith({ caption: 'New caption' })
  })

  it('shows caption when provided', () => {
    const { wrapper } = mountNode({ caption: 'Hello' })

    const input = wrapper.find('.image-caption-input')
    expect((input.element as HTMLInputElement).value).toBe('Hello')
  })

  it('updates the input when the stored caption changes externally', async () => {
    const { wrapper } = mountNode({ caption: 'Original' })

    await wrapper.setProps({
      node: { attrs: { src: 'test.jpg', alt: 'Test', caption: 'Updated' } },
    })

    const input = wrapper.find('.image-caption-input')
    expect((input.element as HTMLInputElement).value).toBe('Updated')
  })
})

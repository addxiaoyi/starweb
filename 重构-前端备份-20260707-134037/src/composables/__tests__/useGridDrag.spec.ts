import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, type Ref } from 'vue';
import { useGridDrag } from '../useGridDrag';

type TestItem = { id: number; name: string };
type MockStyle = Partial<CSSStyleDeclaration>;

describe('useGridDrag', () => {
  let container: HTMLElement;
  let items: Ref<TestItem[]>;

  beforeEach(() => {
    // Setup DOM mock
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock items
    items = ref([
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
      { id: 3, name: 'Item 3' }
    ]);

    // Create child elements
    items.value.forEach((item, index) => {
      const el = document.createElement('div');
      el.id = `item-${item.id}`;
      // Mock layout
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        top: index * 100,
        left: 0,
        width: 100,
        height: 100,
        x: 0,
        y: index * 100,
        bottom: (index + 1) * 100,
        right: 100,
        toJSON: () => {}
      });
      container.appendChild(el);
    });
  });

  afterEach(() => {
    // Ensure any active drag is stopped
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new TouchEvent('touchend'));

    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should initialize correctly', () => {
    const containerRef = ref(container);
    const { isDragging, draggedIndex } = useGridDrag({ items, containerRef });

    expect(isDragging.value).toBe(false);
    expect(draggedIndex.value).toBe(-1);
  });

  it('should start drag and create ghost element', async () => {
    const containerRef = ref(container);
    const { startDrag, isDragging, draggedIndex } = useGridDrag({ items, containerRef });

    // Mock getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      width: '100px',
      height: '100px',
      boxSizing: 'border-box',
      padding: '0px',
      background: 'white',
      borderRadius: '0px'
    } as MockStyle as CSSStyleDeclaration);

    // Mock event
    const event = new MouseEvent('mousedown', {
      clientX: 50,
      clientY: 50,
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(event, 'target', { value: container.children[0] });

    startDrag(0, event);

    expect(isDragging.value).toBe(true);
    expect(draggedIndex.value).toBe(0);

    // Check ghost element
    const ghost = document.querySelector('div[style*="position: fixed"]');
    expect(ghost).toBeTruthy();
    if (ghost) {
      expect((ghost as HTMLElement).style.top).toBe('0px');
      expect((ghost as HTMLElement).style.left).toBe('0px');
    }
  });

  it('should update ghost position on drag move', async () => {
    const containerRef = ref(container);
    const { startDrag } = useGridDrag({ items, containerRef });

    // Mock getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({} as MockStyle as CSSStyleDeclaration);

    // Start drag
    const startEvent = new MouseEvent('mousedown', {
      clientX: 50,
      clientY: 50,
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(startEvent, 'target', { value: container.children[0] });

    startDrag(0, startEvent);

    // Move
    const moveEvent = new MouseEvent('mousemove', {
      clientX: 100,
      clientY: 100,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(moveEvent);

    // Wait for requestAnimationFrame
    await new Promise(resolve => setTimeout(resolve, 50));

    const ghost = document.querySelector('div[style*="position: fixed"]') as HTMLElement;
    // Check transform
    // initial (50, 50) -> current (100, 100) => delta (50, 50)
    expect(ghost.style.transform).toContain('translate(50px, 50px)');
  });

  it('should NOT reorder items immediately when dragging over another item, but should swap on drop', async () => {
    const containerRef = ref(container);
    const { startDrag } = useGridDrag({ items, containerRef });

    // Mock getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({} as MockStyle as CSSStyleDeclaration);

    // Start drag item 0
    const startEvent = new MouseEvent('mousedown', {
      clientX: 50,
      clientY: 50,
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(startEvent, 'target', { value: container.children[0] });

    startDrag(0, startEvent);

    // Move to item 1's position (center at 50, 150)
    const moveEvent = new MouseEvent('mousemove', {
      clientX: 50,
      clientY: 150,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(moveEvent);

    // Mock ghost rect for calculateDropTarget
    const ghost = document.querySelector('div[style*="position: fixed"]') as HTMLElement;
    if (ghost) {
      vi.spyOn(ghost, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 0,
        width: 100,
        height: 100,
        x: 0,
        y: 100,
        bottom: 200,
        right: 100,
        toJSON: () => {}
      });
    }

    // Wait for requestAnimationFrame loop to call calculateDropTarget
    await new Promise(resolve => setTimeout(resolve, 100));

    // items should NOT have changed yet
    expect(items.value[0].id).toBe(1);
    expect(items.value[1].id).toBe(2);

    // Drop
    const endEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(endEvent);

    // Wait for nextTick in onDragEndHandler
    await new Promise(resolve => setTimeout(resolve, 50));

    // Now it should have swapped
    // Initial: [1, 2, 3]
    // Expect: [2, 1, 3]
    expect(items.value[0].id).toBe(2);
    expect(items.value[1].id).toBe(1);
  });
});

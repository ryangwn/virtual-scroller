<script>
import { onMount } from 'svelte';
import { Virtualizer } from 'virtual-scroller-core';

let rootRef = $state();
let renderedItems = $state();
let shouldUseTopPosition = false;
let instance = $state();

onMount(() => {
  instance = new Virtualizer({
    rootElement: rootRef,
    list: Array.from({ length: 10_000 }, (_, index) => {
      const id = String(index + 1);
      return {
        id,
        data: {},
        canBeAnchor: true,
        sortIndex: index,
      };
    }),
    assumedItemHeight: 100,
    minimumOffscreenToViewportRatio: 0.5,
    preferredOffscreenToViewportRatio: 2.5,
    onChange: () => {
      renderedItems = instance.getVirtualItems();
    },
  });
  instance.mount();
});

const measureElement = (node, { itemId }) => {
  $effect(() => {
    const _removeMeasureElement = instance.measureElement(node, itemId);

    return () => {
      _removeMeasureElement();
    };
  });
};
</script>

<div style="position: relative; height: {instance?.getListHeightWithHeadRoom()}px" bind:this={rootRef}>
  {#each renderedItems as item (item.itemId)}
    {@const positioningStyle =  shouldUseTopPosition
      ? { top: `${item.offset}px` }
      : { transform: `translateY(${item.offset}px)`}
    }
    <div
      style="
        width: 100%;
        position: absolute;
        transform: translateY({item.offset}px);
        opacity:{item.visible ? undefined : 0.01}
      "
      use:measureElement={{itemId: item.itemId}}
    >
      <div style="padding: 80px; border: 1px solid black;">
        {item.itemId}
      </div>
    </div>
  {/each}
</div>

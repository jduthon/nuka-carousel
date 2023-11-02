/**
 * @jest-environment jsdom
 */

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import Carousel from './carousel';
import { CarouselProps } from './types';
import { axe } from 'jest-axe';

// Fake timers using Jest
beforeEach(() => {
  jest.useFakeTimers();
});

// Running all pending timers and switching to real timers using Jest
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

async function hasNoViolations(html: Element) {
  await waitFor(async () => {
    expect(await axe(html)).toHaveNoViolations();
  });
}

/**
 * Mock dimensions for the carousel for calculations where carousel dimensions
 * are used, such as with dragging thresholds
 */
const createCarouselRefWithMockedDimensions = ({ defaultWidth = 600 } = {}) => {
  let refValue: HTMLDivElement | null = null;
  const widthGetterMock = jest.fn(() => defaultWidth);

  const carouselRef: React.MutableRefObject<HTMLDivElement> = Object.create(
    {},
    {
      current: {
        get: () => refValue,
        set(newValue) {
          refValue = newValue;
          if (refValue) {
            Object.defineProperty(refValue, 'offsetWidth', {
              get: widthGetterMock,
            });
          }
        },
      },
    }
  );

  return { ref: carouselRef, widthGetterMock };
};

describe('Carousel', () => {
  const renderCarousel = ({
    slideCount = 5,
    ...props
  }: CarouselProps & {
    slideCount?: number;
    ref?: React.RefObject<HTMLDivElement>;
  } = {}) =>
    render(
      <Carousel {...props}>
        {[...Array(slideCount)].map((_, index) => (
          <img src="#" alt={`slide ${index}`} key={index} />
        ))}
      </Carousel>
    );

  it('autoplays at the right rate', async () => {
    const beforeSlide = jest.fn();
    const afterSlide = jest.fn();
    const speed = 500;
    const autoplayInterval = 1000;
    const slideCount = 2;

    const { container } = renderCarousel({
      slideCount,
      autoplay: true,
      autoplayInterval,
      speed,
      wrapAround: true,
      beforeSlide,
      afterSlide,
    });

    expect(beforeSlide).toHaveBeenCalledTimes(0);
    expect(afterSlide).toHaveBeenCalledTimes(0);

    // autoplay initiated, waiting for first interval

    act(() => {
      jest.advanceTimersByTime(autoplayInterval);
    });

    expect(beforeSlide).toHaveBeenCalledTimes(1);
    expect(afterSlide).toHaveBeenCalledTimes(0);

    const checkTimingCycle = (timesMoved: number) => {
      // Animation begins, and next autoplay timeout set up

      act(() => {
        jest.advanceTimersByTime(speed);
      });

      // Animation completes

      expect(beforeSlide).toHaveBeenCalledTimes(timesMoved);
      expect(afterSlide).toHaveBeenCalledTimes(timesMoved);
      expect(afterSlide).toHaveBeenLastCalledWith(timesMoved % slideCount);

      act(() => {
        jest.advanceTimersByTime(autoplayInterval - speed);
      });

      // autoplay timeout triggers

      expect(beforeSlide).toHaveBeenCalledTimes(timesMoved + 1);
      expect(afterSlide).toHaveBeenCalledTimes(timesMoved);
    };

    checkTimingCycle(1);
    checkTimingCycle(2);
    checkTimingCycle(3);

    await hasNoViolations(container);
  });

  it('omits slides whose children are falsy', async () => {
    const { container } = render(
      <Carousel>
        <img src="#" alt={`slide 1`} />
        <img src="#" alt={`slide 2`} />
        {false && <img src="#" alt={`slide 3`} />}
        {null}
        <img src="#" alt={`slide 5`} />
      </Carousel>
    );

    expect(container.getElementsByClassName('slide').length).toBe(3);
    await hasNoViolations(container);
  });

  it('can be controlled with the keyboard', async () => {
    const carouselId = 'keyboard';
    const beforeSlide = jest.fn();
    const keyCodeConfig = {
      nextSlide: [39],
      previousSlide: [37],
      firstSlide: [81],
      lastSlide: [69],
      pause: [32],
    };
    const slideCount = 8;
    const { container } = renderCarousel({
      enableKeyboardControls: true,
      keyCodeConfig,
      slideCount,
      beforeSlide,
      frameAriaLabel: 'keyboard',
      landmark: true,
      carouselId,
    });

    const sliderFrame = screen.getByTestId(`${carouselId}-slider-frame`);

    fireEvent.keyDown(sliderFrame, { keyCode: keyCodeConfig.nextSlide[0] });
    expect(beforeSlide).toHaveBeenLastCalledWith(0, 1);

    fireEvent.keyDown(sliderFrame, { keyCode: keyCodeConfig.nextSlide[0] });
    expect(beforeSlide).toHaveBeenLastCalledWith(1, 2);

    fireEvent.keyDown(sliderFrame, {
      keyCode: keyCodeConfig.previousSlide[0],
    });
    expect(beforeSlide).toHaveBeenLastCalledWith(2, 1);

    fireEvent.keyDown(sliderFrame, {
      keyCode: keyCodeConfig.previousSlide[0],
    });
    expect(beforeSlide).toHaveBeenLastCalledWith(1, 0);

    fireEvent.keyDown(sliderFrame, { keyCode: keyCodeConfig.lastSlide[0] });
    expect(beforeSlide).toHaveBeenLastCalledWith(0, slideCount - 1);

    fireEvent.keyDown(sliderFrame, { keyCode: keyCodeConfig.firstSlide[0] });
    expect(beforeSlide).toHaveBeenLastCalledWith(slideCount - 1, 0);

    await hasNoViolations(container);
  });

  it('detects user-triggered navigation', async () => {
    const carouselId = 'user-navigation';
    const beforeSlide = jest.fn();
    const onUserNavigation = jest.fn();
    const keyCodeConfig = {
      nextSlide: [39],
      previousSlide: [37],
      firstSlide: [81],
      lastSlide: [69],
      pause: [32],
    };
    const autoplayInterval = 3000;
    const slideCount = 8;
    const { container } = renderCarousel({
      enableKeyboardControls: true,
      autoplay: true,
      autoplayInterval,
      keyCodeConfig,
      ref: createCarouselRefWithMockedDimensions().ref,
      slideCount,
      beforeSlide,
      onUserNavigation,
      carouselId,
    });

    expect(onUserNavigation).toHaveBeenCalledTimes(0);

    // Let enough time pass that autoplay triggers navigation
    act(() => {
      jest.advanceTimersByTime(autoplayInterval);
    });

    // Make sure the navigation happened, but did not trigger the
    // `onUserNavigation` callback (because it wasn't user-initiated)
    expect(onUserNavigation).toHaveBeenCalledTimes(0);
    expect(beforeSlide).toHaveBeenLastCalledWith(0, 1);

    const sliderFrame = screen.getByTestId(`${carouselId}-slider-frame`);

    // Simulating keyboard shortcut use to navigate
    fireEvent.keyDown(sliderFrame, { keyCode: keyCodeConfig.nextSlide[0] });
    expect(beforeSlide).toHaveBeenLastCalledWith(1, 2);
    expect(onUserNavigation).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(sliderFrame, {
      keyCode: keyCodeConfig.previousSlide[0],
    });
    expect(onUserNavigation).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(sliderFrame, { keyCode: keyCodeConfig.lastSlide[0] });
    expect(onUserNavigation).toHaveBeenCalledTimes(3);

    fireEvent.keyDown(sliderFrame, { keyCode: keyCodeConfig.firstSlide[0] });
    expect(onUserNavigation).toHaveBeenCalledTimes(4);

    // Simulating clicks on default controls to navigate
    fireEvent.click(screen.getByRole('button', { name: /next/ }));
    expect(onUserNavigation).toHaveBeenCalledTimes(5);

    fireEvent.click(screen.getByRole('button', { name: /prev/ }));
    expect(onUserNavigation).toHaveBeenCalledTimes(6);

    fireEvent.click(screen.getByRole('tab', { name: /slide 2/ }));
    expect(onUserNavigation).toHaveBeenCalledTimes(7);

    // Simulating drag to navigate
    fireEvent.mouseDown(sliderFrame, { clientX: 100 });
    fireEvent.mouseMove(sliderFrame, { clientX: 100 });
    jest.advanceTimersByTime(100);
    fireEvent.mouseMove(sliderFrame, { clientX: 700 });
    fireEvent.mouseUp(sliderFrame, { clientX: 700 });
    expect(onUserNavigation).toHaveBeenCalledTimes(8);

    // Simulating swipe to navigate
    fireEvent.touchStart(sliderFrame, { touches: [{ pageX: 700 }] });
    fireEvent.touchMove(sliderFrame, { touches: [{ pageX: 700 }] });
    jest.advanceTimersByTime(100);
    fireEvent.touchMove(sliderFrame, { touches: [{ pageX: 100 }] });
    fireEvent.touchEnd(sliderFrame, { touches: [{ pageX: 100 }] });
    expect(onUserNavigation).toHaveBeenCalledTimes(9);

    // Should not be triggering navigation callback when dragging didn't trigger navigation
    fireEvent.mouseDown(sliderFrame, { clientX: 100 });
    fireEvent.mouseMove(sliderFrame, { clientX: 100 });
    jest.advanceTimersByTime(10);
    fireEvent.mouseMove(sliderFrame, { clientX: 105 });
    fireEvent.mouseUp(sliderFrame, { clientX: 105 });
    expect(onUserNavigation).toHaveBeenCalledTimes(9);

    await hasNoViolations(container);
  });

  it('calls default control callbacks when interacted with', async () => {
    const beforeSlide = jest.fn();
    const nextButtonOnClick = jest.fn();
    const prevButtonOnClick = jest.fn();
    const pagingDotsOnClick = jest.fn();
    const slideCount = 8;

    const { container } = renderCarousel({
      slideCount,
      beforeSlide,
      defaultControlsConfig: {
        nextButtonOnClick,
        prevButtonOnClick,
        pagingDotsOnClick,
      },
    });

    // Simulating clicks on default controls to navigate
    expect(nextButtonOnClick).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole('button', { name: /next/ }));
    expect(nextButtonOnClick).toHaveBeenCalledTimes(1);

    expect(prevButtonOnClick).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole('button', { name: /prev/ }));
    expect(prevButtonOnClick).toHaveBeenCalledTimes(1);

    expect(pagingDotsOnClick).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole('tab', { name: /slide 2/ }));
    expect(pagingDotsOnClick).toHaveBeenCalledTimes(1);

    // Check that calling preventDefault in the custom callback will stop the
    // default behavior (navigation) before it happens
    const preventDefault = (event: React.FormEvent) => event.preventDefault();
    nextButtonOnClick.mockImplementation(preventDefault);
    prevButtonOnClick.mockImplementation(preventDefault);
    pagingDotsOnClick.mockImplementation(preventDefault);

    expect(beforeSlide).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: /next/ }));
    fireEvent.click(screen.getByRole('button', { name: /prev/ }));
    fireEvent.click(screen.getByRole('tab', { name: /slide 2/ }));
    expect(beforeSlide).toHaveBeenCalledTimes(3);

    await hasNoViolations(container);
  });
});

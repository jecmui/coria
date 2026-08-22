import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { DEFAULT_APPEARANCE, LIGHT_COLORS } from "../lib/appearance";
import type { AppearanceColors, AppearanceSettings, ThemeMode } from "../types";

interface AppearanceState {
    userId: string | null;
    settings: AppearanceSettings;
    settingsLoading: boolean;
    settingsError: string | null;
    load: (userId: string) => Promise<void>;
    saveSettings: (settings: AppearanceSettings) => Promise<boolean>;
    toggleSnapToGrid: () => Promise<boolean>;
    clear: () => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
    userId: null,
    settings: DEFAULT_APPEARANCE,
    settingsLoading: false,
    settingsError: null,

    load: async (userId) => {
        set({ userId, settingsLoading: true, settingsError: null });
        const { data, error } = await supabase
            .from("user_preferences")
            .select(
                "theme, snap_to_grid, color_board, color_board_line, color_paper, color_paper_edge, color_ink, color_ink_soft, color_pin_todo, color_pin_note, color_pin_timer, color_pin_image, color_pin_calendar",
            )
            .eq("user_id", userId)
            .single();

        if (error) {
            console.error("Failed to load Appearance settings:", error.message);
            set({ settingsLoading: false, settingsError: error.message });
            return;
        }

        const colors: AppearanceColors = {
            board: data.color_board ?? LIGHT_COLORS.board,
            boardLine: data.color_board_line ?? LIGHT_COLORS.boardLine,
            paper: data.color_paper ?? LIGHT_COLORS.paper,
            paperEdge: data.color_paper_edge ?? LIGHT_COLORS.paperEdge,
            ink: data.color_ink ?? LIGHT_COLORS.ink,
            inkSoft: data.color_ink_soft ?? LIGHT_COLORS.inkSoft,
            pinTodo: data.color_pin_todo ?? LIGHT_COLORS.pinTodo,
            pinNote: data.color_pin_note ?? LIGHT_COLORS.pinNote,
            pinTimer: data.color_pin_timer ?? LIGHT_COLORS.pinTimer,
            pinImage: data.color_pin_image ?? LIGHT_COLORS.pinImage,
            pinCalendar: data.color_pin_calendar ?? LIGHT_COLORS.pinCalendar,
            // Not queried from user_preferences yet -- there's no column for
            // it and no settings control to set one, so Custom theme always
            // gets the light default here (light/dark/system bypass this
            // entirely via their own palette's dueDateBadge in resolveColors).
            dueDateBadge: LIGHT_COLORS.dueDateBadge,
        };

        set({
            settings: {
                theme: (data.theme as ThemeMode) ?? DEFAULT_APPEARANCE.theme,
                colors,
                snapToGrid:
                    data.snap_to_grid ?? DEFAULT_APPEARANCE.snapToGrid,
            },
            settingsLoading: false,
        });
    },

    saveSettings: async (settings) => {
        const userId = get().userId;
        if (!userId) return false;
        set({ settingsError: null });
        const { error } = await supabase
            .from("user_preferences")
            .update({
                theme: settings.theme,
                snap_to_grid: settings.snapToGrid,
                color_board: settings.colors.board,
                color_board_line: settings.colors.boardLine,
                color_paper: settings.colors.paper,
                color_paper_edge: settings.colors.paperEdge,
                color_ink: settings.colors.ink,
                color_ink_soft: settings.colors.inkSoft,
                color_pin_todo: settings.colors.pinTodo,
                color_pin_note: settings.colors.pinNote,
                color_pin_timer: settings.colors.pinTimer,
                color_pin_image: settings.colors.pinImage,
                color_pin_calendar: settings.colors.pinCalendar,
            })
            .eq("user_id", userId);

        if (error) {
            set({ settingsError: error.message });
            return false;
        }

        set({ settings });
        return true;
    },

    toggleSnapToGrid: async () => {
        const { settings, saveSettings } = get();
        return saveSettings({ ...settings, snapToGrid: !settings.snapToGrid });
    },

    clear: () =>
        set({
            userId: null,
            settings: DEFAULT_APPEARANCE,
            settingsLoading: false,
            settingsError: null,
        }),
}));

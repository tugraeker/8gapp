type AvatarOptions = Record<string, string[]>;
type AvatarConfig = {
    provider?: string;
    seed?: string;
    style?: string;
    options?: AvatarOptions;
};

export const getAvatarUrl = (avatarConfig: AvatarConfig | null | undefined, username: string) => {
    const config = avatarConfig || {};
    const seed = config.seed || username || 'default';

    // If no specific provider or style is set, use a default Dicebear style
    if (!config.provider && !config.style) {
        return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
    }

    // New providers
    if (config.provider === 'multiavatar') {
        return `https://api.multiavatar.com/${encodeURIComponent(seed)}.svg`;
    }
    if (config.provider === 'robohash') {
        return `https://robohash.org/${encodeURIComponent(seed)}.png?size=200x200`;
    }

    // Backward compatibility with previous DiceBear config
    const style = config.style || 'avataaars';

    if (config.options && Object.keys(config.options).length > 0) {
        const params = new URLSearchParams();
        if (seed) params.append('seed', seed);
        Object.keys(config.options).forEach(key => {
            const vals = config.options?.[key];
            if (vals && vals.length > 0) {
                params.append(key, vals.join(','));
            }
        });
        return `https://api.dicebear.com/7.x/${style}/svg?${params.toString()}`;
    }

    return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
};
